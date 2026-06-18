import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";

import type { AutomationFolderSummary } from "../../shared/automationTypes";
import type { PermissionPromptResponseMode } from "../../shared/permissionTypes";
import type { WorkflowAgentFolderSummary, WorkflowAgentThreadSummary, WorkflowArtifactSummary, WorkflowDashboard, WorkflowExplorationTraceSummary, WorkflowRevisionSummary, WorkflowRunSummary } from "../../shared/workflowTypes";
import type { WorkflowExplorationBudgets } from "../../shared/workflowExplorationBudgets";
import { workflowArtifactRevisionRequest } from "./automationUiModel";
import type { WorkflowArtifactPanelId } from "./workflowArtifactPanelUiModel";
import {
  normalizeWorkflowExplorationBudgets,
  workflowExplorationBudgetWithField,
  workflowExplorationRunInput,
} from "./workflowExplorationBudgetUiModel";

export const workflowExplorationSkipStorageKey = "ambient.workflowExplorationSkips.v1";

export type WorkflowDiscoveryRestartDrafts = Record<string, string>;
export type WorkflowDiscoveryAnswers = Record<string, string>;
export type WorkflowDiscoveryOptimisticAnswers = Record<string, true>;
export type WorkflowExplorationSkippedByThreadId = Record<string, string>;
export type WorkflowExplorationBudgetsByThreadId = Record<string, WorkflowExplorationBudgets>;
export type WorkflowExplorationTracesByThreadId = Record<string, WorkflowExplorationTraceSummary[]>;

export function decodeWorkflowExplorationSkips(raw: string | null): WorkflowExplorationSkippedByThreadId {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return Object.fromEntries(
      Object.entries(parsed).filter((entry): entry is [string, string] => typeof entry[0] === "string" && typeof entry[1] === "string" && Boolean(entry[0])),
    );
  } catch {
    return {};
  }
}

export function activeDraftWorkflowRevisionForThread<TRevision extends Pick<WorkflowRevisionSummary, "workflowThreadId" | "status">>(
  revisions: TRevision[],
  workflowThreadId?: string,
): TRevision | undefined {
  if (!workflowThreadId) return undefined;
  return revisions.find((revision) => revision.workflowThreadId === workflowThreadId && revision.status === "draft");
}

export function workflowDiscoveryRestartRequest(
  drafts: WorkflowDiscoveryRestartDrafts,
  thread: Pick<WorkflowAgentThreadSummary, "id" | "initialRequest">,
): string {
  return (drafts[thread.id] ?? thread.initialRequest).trim();
}

export function workflowDiscoveryRestartDraftsAfterRestart(
  drafts: WorkflowDiscoveryRestartDrafts,
  threadId: string,
): WorkflowDiscoveryRestartDrafts {
  const next = { ...drafts };
  delete next[threadId];
  return next;
}

export function workflowDiscoveryAnswersAfterAnswered(
  answers: WorkflowDiscoveryAnswers,
  questionId: string,
): WorkflowDiscoveryAnswers {
  return { ...answers, [questionId]: "" };
}

export function workflowDiscoveryOptimisticAnswersWithoutQuestion(
  answers: WorkflowDiscoveryOptimisticAnswers,
  questionId: string,
): WorkflowDiscoveryOptimisticAnswers {
  const next = { ...answers };
  delete next[questionId];
  return next;
}

export function workflowExplorationBudgetsAfterUpdate(
  budgetsByThreadId: WorkflowExplorationBudgetsByThreadId,
  threadId: string,
  field: keyof WorkflowExplorationBudgets,
  value: unknown,
): WorkflowExplorationBudgetsByThreadId {
  return {
    ...budgetsByThreadId,
    [threadId]: workflowExplorationBudgetWithField(budgetsByThreadId[threadId] ?? {}, field, value),
  };
}

export function workflowExplorationBudgetsAfterReset(
  budgetsByThreadId: WorkflowExplorationBudgetsByThreadId,
  threadId: string,
): WorkflowExplorationBudgetsByThreadId {
  if (!budgetsByThreadId[threadId]) return budgetsByThreadId;
  const next = { ...budgetsByThreadId };
  delete next[threadId];
  return next;
}

export function workflowExplorationSkipsAfterRunStart(
  skippedByThreadId: WorkflowExplorationSkippedByThreadId,
  threadId: string,
): WorkflowExplorationSkippedByThreadId {
  const next = { ...skippedByThreadId };
  delete next[threadId];
  return next;
}

export function workflowExplorationSkipsAfterSkip(
  skippedByThreadId: WorkflowExplorationSkippedByThreadId,
  threadId: string,
  skippedAtIso = new Date().toISOString(),
): WorkflowExplorationSkippedByThreadId {
  return { ...skippedByThreadId, [threadId]: skippedAtIso };
}

export function workflowExplorationTracesAfterRunResult(
  tracesByThreadId: WorkflowExplorationTracesByThreadId,
  threadId: string,
  trace: WorkflowExplorationTraceSummary,
): WorkflowExplorationTracesByThreadId {
  return {
    ...tracesByThreadId,
    [threadId]: [trace, ...(tracesByThreadId[threadId] ?? []).filter((existingTrace) => existingTrace.id !== trace.id)],
  };
}

export function latestWorkflowRunForArtifact(runs: WorkflowRunSummary[], artifactId: string): WorkflowRunSummary | undefined {
  return runs.find((run) => run.artifactId === artifactId);
}

function messageForError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

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
  refreshAutomationFolders: () => Promise<{ automationFolders: AutomationFolderSummary[]; workflowAgentFolders: WorkflowAgentFolderSummary[] }>;
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
  const [workflowExplorationBudgetsByThreadId, setWorkflowExplorationBudgetsByThreadId] = useState<WorkflowExplorationBudgetsByThreadId>({});
  const [workflowExplorationSkippedByThreadId, setWorkflowExplorationSkippedByThreadId] = useState<WorkflowExplorationSkippedByThreadId>(() => {
    if (typeof window === "undefined") return {};
    return decodeWorkflowExplorationSkips(window.localStorage.getItem(workflowExplorationSkipStorageKey));
  });
  const [workflowRevisionSource, setWorkflowRevisionSource] = useState<{ artifactId: string; title: string } | undefined>();
  const workflowRequestRef = useRef<HTMLTextAreaElement | null>(null);
  const workflowDiscoveryQuestionFocusRef = useRef<string | undefined>(undefined);
  const autoCompiledWorkflowThreadsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    const thread = selectedWorkflowAgentThread;
    if (!thread) return;
    const revision = activeDraftWorkflowRevisionForThread(workflowRevisions, thread.id);
    const questions = revision ? thread.discoveryQuestions.filter((question) => question.revisionId === revision.id) : thread.discoveryQuestions.filter((question) => !question.revisionId);
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

  async function createWorkflowSample() {
    onWorkflowBusyChanged("sample");
    onWorkflowErrorChanged(undefined);
    onWorkflowCompileProgressReset();
    try {
      const dashboard = await window.ambientDesktop.createWorkflowSampleArtifact();
      onWorkflowDashboardChanged(dashboard);
      await refreshAutomationFolders();
      const newestArtifact = dashboard.artifacts[0];
      await onSelectWorkflowAgentThreadForArtifact(newestArtifact);
      const newestRun = newestArtifact ? latestWorkflowRunForArtifact(dashboard.runs, newestArtifact.id) : dashboard.runs[0];
      if (newestRun) await onOpenWorkflowRunDetail(newestRun.id);
    } catch (error) {
      onWorkflowErrorChanged(messageForError(error));
    } finally {
      onWorkflowBusyChanged(undefined);
    }
  }

  async function compileWorkflowPreview() {
    const userRequest = workflowRequest.trim();
    if (!userRequest) return;
    onWorkflowBusyChanged("compile");
    setWorkflowCompileThreadId(undefined);
    onWorkflowErrorChanged(undefined);
    onWorkflowCompileProgressReset();
    try {
      const dashboard = await window.ambientDesktop.compileWorkflowPreview({ userRequest });
      onWorkflowDashboardChanged(dashboard);
      setWorkflowRequest("");
      setWorkflowRevisionSource(undefined);
      await refreshAutomationFolders();
      const newestArtifact = dashboard.artifacts[0];
      await onSelectWorkflowAgentThreadForArtifact(newestArtifact);
      const newestRun = newestArtifact ? latestWorkflowRunForArtifact(dashboard.runs, newestArtifact.id) : dashboard.runs[0];
      if (newestRun) await onOpenWorkflowRunDetail(newestRun.id);
    } catch (error) {
      onWorkflowErrorChanged(messageForError(error));
    } finally {
      onWorkflowBusyChanged(undefined);
    }
  }

  async function startWorkflowDiscoveryFromRequest() {
    const initialRequest = workflowRequest.trim();
    if (!initialRequest) return;
    setWorkflowDiscoveryBusy("start");
    onWorkflowErrorChanged(undefined);
    try {
      const result = await window.ambientDesktop.startWorkflowDiscovery({
        initialRequest,
        projectPath: activeProjectPath,
        folderId: selectedWorkflowAgentFolder?.id ?? selectedWorkflowAgentThread?.folderId ?? workflowAgentFolders[0]?.id,
      });
      onWorkflowAgentFoldersChanged(result.folders);
      onSelectWorkflowAgentThread(result.thread);
      setWorkflowRequest("");
      setWorkflowRevisionSource(undefined);
    } catch (error) {
      onWorkflowErrorChanged(messageForError(error));
      try {
        await refreshAutomationFolders();
      } catch {
        // Preserve the provider error above; refresh is best-effort.
      }
    } finally {
      setWorkflowDiscoveryBusy(undefined);
    }
  }

  async function answerWorkflowDiscoveryQuestion(questionId: string, choiceId?: string, freeform?: string) {
    setWorkflowDiscoveryBusy(questionId);
    onWorkflowErrorChanged(undefined);
    setOptimisticWorkflowDiscoveryAnswers((current) => ({ ...current, [questionId]: true }));
    try {
      const result = await window.ambientDesktop.answerWorkflowDiscoveryQuestion({ questionId, choiceId, freeform });
      onWorkflowAgentFoldersChanged(result.folders);
      onSelectWorkflowAgentThread(result.thread);
      setWorkflowDiscoveryAnswers((current) => workflowDiscoveryAnswersAfterAnswered(current, questionId));
      setOptimisticWorkflowDiscoveryAnswers((current) => workflowDiscoveryOptimisticAnswersWithoutQuestion(current, questionId));
    } catch (error) {
      onWorkflowErrorChanged(messageForError(error));
      setOptimisticWorkflowDiscoveryAnswers((current) => workflowDiscoveryOptimisticAnswersWithoutQuestion(current, questionId));
      const selectedId = selectedWorkflowAgentThread?.id;
      if (selectedId) {
        try {
          const folders = await refreshAutomationFolders();
          const nextThread = folders.workflowAgentFolders.flatMap((folder) => folder.threads).find((thread) => thread.id === selectedId);
          if (nextThread) onSelectWorkflowAgentThread(nextThread);
        } catch {
          // Preserve the provider error above; refresh is best-effort for showing persisted activity.
        }
      }
    } finally {
      setWorkflowDiscoveryBusy(undefined);
    }
  }

  async function restartWorkflowDiscoveryThread(thread: WorkflowAgentThreadSummary) {
    const initialRequest = workflowDiscoveryRestartRequest(workflowRequestRestartDrafts, thread);
    if (!initialRequest) return;
    setWorkflowDiscoveryBusy(`restart:${thread.id}`);
    onWorkflowErrorChanged(undefined);
    try {
      const result = await window.ambientDesktop.startWorkflowDiscovery({
        initialRequest,
        projectPath: thread.projectPath,
        folderId: thread.folderId,
        traceMode: thread.traceMode,
      });
      onWorkflowAgentFoldersChanged(result.folders);
      onSelectWorkflowAgentThread(result.thread);
      setWorkflowRequestRestartDrafts((current) => workflowDiscoveryRestartDraftsAfterRestart(current, thread.id));
      setWorkflowRevisionSource(undefined);
    } catch (error) {
      onWorkflowErrorChanged(messageForError(error));
      try {
        await refreshAutomationFolders();
      } catch {
        // Preserve the provider error above; refresh is best-effort.
      }
    } finally {
      setWorkflowDiscoveryBusy(undefined);
    }
  }

  async function resolveWorkflowDiscoveryAccessRequest(
    questionId: string,
    accessRequestId: string,
    response: PermissionPromptResponseMode,
  ) {
    setWorkflowDiscoveryBusy(`access:${questionId}:${accessRequestId}`);
    onWorkflowErrorChanged(undefined);
    try {
      const result = await window.ambientDesktop.resolveWorkflowDiscoveryAccessRequest({ questionId, accessRequestId, response });
      onWorkflowAgentFoldersChanged(result.folders);
      onSelectWorkflowAgentThread(result.thread);
    } catch (error) {
      onWorkflowErrorChanged(messageForError(error));
    } finally {
      setWorkflowDiscoveryBusy(undefined);
    }
  }

  function workflowExplorationBudgetsForThread(threadId: string): WorkflowExplorationBudgets {
    return normalizeWorkflowExplorationBudgets(workflowExplorationBudgetsByThreadId[threadId]);
  }

  function updateWorkflowExplorationBudget(threadId: string, field: keyof WorkflowExplorationBudgets, value: unknown) {
    setWorkflowExplorationBudgetsByThreadId((current) => workflowExplorationBudgetsAfterUpdate(current, threadId, field, value));
  }

  function resetWorkflowExplorationBudget(threadId: string) {
    setWorkflowExplorationBudgetsByThreadId((current) => workflowExplorationBudgetsAfterReset(current, threadId));
  }

  async function runWorkflowExplorationForThread(thread: WorkflowAgentThreadSummary) {
    onWorkflowBusyChanged(`exploration:${thread.id}`);
    onWorkflowErrorChanged(undefined);
    setWorkflowExplorationSkippedByThreadId((current) => workflowExplorationSkipsAfterRunStart(current, thread.id));
    try {
      const budgets = workflowExplorationBudgetsForThread(thread.id);
      const result = await window.ambientDesktop.runWorkflowThreadExploration(workflowExplorationRunInput(thread.id, budgets));
      onWorkflowAgentFoldersChanged(result.folders);
      onSelectWorkflowAgentThread(result.thread);
      onWorkflowExplorationTracesChanged((current) => workflowExplorationTracesAfterRunResult(current, thread.id, result.trace));
      await loadWorkflowExplorationTraces(thread.id);
      await loadWorkflowVersions(thread.id);
    } catch (error) {
      onWorkflowErrorChanged(messageForError(error));
      await loadWorkflowExplorationTraces(thread.id);
    } finally {
      onWorkflowBusyChanged(undefined);
    }
  }

  function skipWorkflowExplorationForThread(thread: WorkflowAgentThreadSummary) {
    setWorkflowExplorationSkippedByThreadId((current) => workflowExplorationSkipsAfterSkip(current, thread.id));
    onWorkflowArtifactPanelChanged(thread.id, "exploration");
  }

  async function compileWorkflowThreadPreview(thread: WorkflowAgentThreadSummary, revision?: WorkflowRevisionSummary) {
    const userRequest = (revision?.requestedChange ?? thread.initialRequest).trim();
    if (!userRequest) return;
    onWorkflowBusyChanged("compile");
    setWorkflowCompileThreadId(thread.id);
    onWorkflowErrorChanged(undefined);
    onWorkflowCompileProgressReset();
    try {
      const dashboard = await window.ambientDesktop.compileWorkflowPreview({
        userRequest,
        workflowThreadId: thread.id,
        revisionId: revision?.id,
      });
      onWorkflowDashboardChanged(dashboard);
      await refreshAutomationFolders();
      const nextThread = (await window.ambientDesktop.listWorkflowAgentFolders()).flatMap((folder) => folder.threads).find((candidate) => candidate.id === thread.id);
      if (nextThread) onSelectWorkflowAgentThread(nextThread);
      await loadWorkflowRevisions(thread.id);
      await loadWorkflowVersions(thread.id);
      const newestArtifact = dashboard.artifacts.find((artifact) => artifact.workflowThreadId === thread.id) ?? dashboard.artifacts[0];
      const newestRun = newestArtifact ? latestWorkflowRunForArtifact(dashboard.runs, newestArtifact.id) : dashboard.runs[0];
      if (newestRun) await onOpenWorkflowRunDetail(newestRun.id);
    } catch (error) {
      onWorkflowErrorChanged(messageForError(error));
    } finally {
      onWorkflowBusyChanged(undefined);
    }
  }

  async function startWorkflowArtifactRevision(artifact: WorkflowArtifactSummary) {
    if (!artifact.workflowThreadId) return;
    onWorkflowBusyChanged(`revision-discovery:${artifact.id}`);
    onWorkflowErrorChanged(undefined);
    try {
      const result = await window.ambientDesktop.startWorkflowRevisionDiscovery({
        workflowThreadId: artifact.workflowThreadId,
        artifactId: artifact.id,
        requestedChange: workflowArtifactRevisionRequest({
          title: artifact.title,
          status: artifact.status,
          goal: artifact.spec.goal,
          summary: artifact.spec.summary,
          successCriteria: artifact.spec.successCriteria,
        }),
      });
      onWorkflowAgentFoldersChanged(result.folders);
      onSelectWorkflowAgentThread(result.thread);
      await loadWorkflowRevisions(result.thread.id);
      setWorkflowRequest("");
      setWorkflowRevisionSource(undefined);
    } catch (error) {
      onWorkflowErrorChanged(messageForError(error));
    } finally {
      onWorkflowBusyChanged(undefined);
    }
  }

  function clearWorkflowRevisionDraft() {
    setWorkflowRequest("");
    setWorkflowRevisionSource(undefined);
  }

  function focusWorkflowRequestEditor() {
    workflowRequestRef.current?.scrollIntoView({ block: "center", behavior: "smooth" });
    workflowRequestRef.current?.focus();
  }

  async function openWorkflowCompileDiagnostics(path: string) {
    onWorkflowErrorChanged(undefined);
    try {
      await window.ambientDesktop.openLocalPath(path);
    } catch (error) {
      onWorkflowErrorChanged(messageForError(error));
    }
  }

  async function copyWorkflowCompileFailureReport(reportText: string) {
    try {
      await window.ambientDesktop.writeClipboardText(reportText);
      onWorkflowErrorChanged(undefined);
    } catch (error) {
      onWorkflowErrorChanged(messageForError(error));
    }
  }

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
