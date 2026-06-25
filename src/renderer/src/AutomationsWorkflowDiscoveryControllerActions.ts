import type { Dispatch, RefObject, SetStateAction } from "react";

import type { AutomationFolderSummary } from "../../shared/automationTypes";
import type { PermissionPromptResponseMode } from "../../shared/permissionTypes";
import type {
  WorkflowAgentFolderSummary,
  WorkflowAgentThreadSummary,
  WorkflowArtifactSummary,
  WorkflowDashboard,
  WorkflowRevisionSummary,
} from "../../shared/workflowTypes";
import type { WorkflowExplorationBudgets } from "../../shared/workflowExplorationBudgets";
import { workflowArtifactRevisionRequest } from "./automationUiModel";
import type { WorkflowArtifactPanelId } from "./workflowArtifactPanelUiModel";
import { normalizeWorkflowExplorationBudgets, workflowExplorationRunInput } from "./workflowExplorationBudgetUiModel";
import {
  latestWorkflowRunForArtifact,
  workflowDiscoveryAnswersAfterAnswered,
  workflowDiscoveryErrorMessage,
  workflowDiscoveryOptimisticAnswersWithoutQuestion,
  workflowDiscoveryRestartDraftsAfterRestart,
  workflowDiscoveryRestartRequest,
  workflowExplorationBudgetsAfterReset,
  workflowExplorationBudgetsAfterUpdate,
  workflowExplorationSkipsAfterRunStart,
  workflowExplorationSkipsAfterSkip,
  workflowExplorationTracesAfterRunResult,
  type WorkflowDiscoveryAnswers,
  type WorkflowDiscoveryOptimisticAnswers,
  type WorkflowDiscoveryRestartDrafts,
  type WorkflowExplorationBudgetsByThreadId,
  type WorkflowExplorationSkippedByThreadId,
  type WorkflowExplorationTracesByThreadId,
} from "./AutomationsWorkflowDiscoveryControllerModel";

export type AutomationsWorkflowDiscoveryControllerActionsInput = {
  activeProjectPath: string;
  selectedWorkflowAgentFolder?: WorkflowAgentFolderSummary;
  selectedWorkflowAgentThread?: WorkflowAgentThreadSummary;
  workflowAgentFolders: WorkflowAgentFolderSummary[];
  workflowRequest: string;
  workflowRequestRestartDrafts: WorkflowDiscoveryRestartDrafts;
  workflowExplorationBudgetsByThreadId: WorkflowExplorationBudgetsByThreadId;
  workflowRequestRef: RefObject<HTMLTextAreaElement | null>;
  setWorkflowCompileThreadId: Dispatch<SetStateAction<string | undefined>>;
  setWorkflowDiscoveryBusy: Dispatch<SetStateAction<string | undefined>>;
  setWorkflowDiscoveryAnswers: Dispatch<SetStateAction<WorkflowDiscoveryAnswers>>;
  setOptimisticWorkflowDiscoveryAnswers: Dispatch<SetStateAction<WorkflowDiscoveryOptimisticAnswers>>;
  setWorkflowRequest: Dispatch<SetStateAction<string>>;
  setWorkflowRequestRestartDrafts: Dispatch<SetStateAction<WorkflowDiscoveryRestartDrafts>>;
  setWorkflowExplorationBudgetsByThreadId: Dispatch<SetStateAction<WorkflowExplorationBudgetsByThreadId>>;
  setWorkflowExplorationSkippedByThreadId: Dispatch<SetStateAction<WorkflowExplorationSkippedByThreadId>>;
  setWorkflowRevisionSource: Dispatch<SetStateAction<{ artifactId: string; title: string } | undefined>>;
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
};

export function createAutomationsWorkflowDiscoveryControllerActions(input: AutomationsWorkflowDiscoveryControllerActionsInput) {
  async function createWorkflowSample() {
    input.onWorkflowBusyChanged("sample");
    input.onWorkflowErrorChanged(undefined);
    input.onWorkflowCompileProgressReset();
    try {
      const dashboard = await window.ambientDesktop.createWorkflowSampleArtifact();
      input.onWorkflowDashboardChanged(dashboard);
      await input.refreshAutomationFolders();
      const newestArtifact = dashboard.artifacts[0];
      await input.onSelectWorkflowAgentThreadForArtifact(newestArtifact);
      const newestRun = newestArtifact ? latestWorkflowRunForArtifact(dashboard.runs, newestArtifact.id) : dashboard.runs[0];
      if (newestRun) await input.onOpenWorkflowRunDetail(newestRun.id);
    } catch (error) {
      input.onWorkflowErrorChanged(workflowDiscoveryErrorMessage(error));
    } finally {
      input.onWorkflowBusyChanged(undefined);
    }
  }

  async function compileWorkflowPreview() {
    const userRequest = input.workflowRequest.trim();
    if (!userRequest) return;
    input.onWorkflowBusyChanged("compile");
    input.setWorkflowCompileThreadId(undefined);
    input.onWorkflowErrorChanged(undefined);
    input.onWorkflowCompileProgressReset();
    try {
      const dashboard = await window.ambientDesktop.compileWorkflowPreview({ userRequest });
      input.onWorkflowDashboardChanged(dashboard);
      input.setWorkflowRequest("");
      input.setWorkflowRevisionSource(undefined);
      await input.refreshAutomationFolders();
      const newestArtifact = dashboard.artifacts[0];
      await input.onSelectWorkflowAgentThreadForArtifact(newestArtifact);
      const newestRun = newestArtifact ? latestWorkflowRunForArtifact(dashboard.runs, newestArtifact.id) : dashboard.runs[0];
      if (newestRun) await input.onOpenWorkflowRunDetail(newestRun.id);
    } catch (error) {
      input.onWorkflowErrorChanged(workflowDiscoveryErrorMessage(error));
    } finally {
      input.onWorkflowBusyChanged(undefined);
    }
  }

  async function startWorkflowDiscoveryFromRequest() {
    const initialRequest = input.workflowRequest.trim();
    if (!initialRequest) return;
    input.setWorkflowDiscoveryBusy("start");
    input.onWorkflowErrorChanged(undefined);
    try {
      const result = await window.ambientDesktop.startWorkflowDiscovery({
        initialRequest,
        projectPath: input.activeProjectPath,
        folderId: input.selectedWorkflowAgentFolder?.id ?? input.selectedWorkflowAgentThread?.folderId ?? input.workflowAgentFolders[0]?.id,
      });
      input.onWorkflowAgentFoldersChanged(result.folders);
      input.onSelectWorkflowAgentThread(result.thread);
      input.setWorkflowRequest("");
      input.setWorkflowRevisionSource(undefined);
    } catch (error) {
      input.onWorkflowErrorChanged(workflowDiscoveryErrorMessage(error));
      try {
        await input.refreshAutomationFolders();
      } catch {
        // Preserve the provider error above; refresh is best-effort.
      }
    } finally {
      input.setWorkflowDiscoveryBusy(undefined);
    }
  }

  async function answerWorkflowDiscoveryQuestion(questionId: string, choiceId?: string, freeform?: string) {
    input.setWorkflowDiscoveryBusy(questionId);
    input.onWorkflowErrorChanged(undefined);
    input.setOptimisticWorkflowDiscoveryAnswers((current) => ({ ...current, [questionId]: true }));
    try {
      const result = await window.ambientDesktop.answerWorkflowDiscoveryQuestion({ questionId, choiceId, freeform });
      input.onWorkflowAgentFoldersChanged(result.folders);
      input.onSelectWorkflowAgentThread(result.thread);
      input.setWorkflowDiscoveryAnswers((current) => workflowDiscoveryAnswersAfterAnswered(current, questionId));
      input.setOptimisticWorkflowDiscoveryAnswers((current) => workflowDiscoveryOptimisticAnswersWithoutQuestion(current, questionId));
    } catch (error) {
      input.onWorkflowErrorChanged(workflowDiscoveryErrorMessage(error));
      input.setOptimisticWorkflowDiscoveryAnswers((current) => workflowDiscoveryOptimisticAnswersWithoutQuestion(current, questionId));
      const selectedId = input.selectedWorkflowAgentThread?.id;
      if (selectedId) {
        try {
          const folders = await input.refreshAutomationFolders();
          const nextThread = folders.workflowAgentFolders.flatMap((folder) => folder.threads).find((thread) => thread.id === selectedId);
          if (nextThread) input.onSelectWorkflowAgentThread(nextThread);
        } catch {
          // Preserve the provider error above; refresh is best-effort for showing persisted activity.
        }
      }
    } finally {
      input.setWorkflowDiscoveryBusy(undefined);
    }
  }

  async function restartWorkflowDiscoveryThread(thread: WorkflowAgentThreadSummary) {
    const initialRequest = workflowDiscoveryRestartRequest(input.workflowRequestRestartDrafts, thread);
    if (!initialRequest) return;
    input.setWorkflowDiscoveryBusy(`restart:${thread.id}`);
    input.onWorkflowErrorChanged(undefined);
    try {
      const result = await window.ambientDesktop.startWorkflowDiscovery({
        initialRequest,
        projectPath: thread.projectPath,
        folderId: thread.folderId,
        traceMode: thread.traceMode,
      });
      input.onWorkflowAgentFoldersChanged(result.folders);
      input.onSelectWorkflowAgentThread(result.thread);
      input.setWorkflowRequestRestartDrafts((current) => workflowDiscoveryRestartDraftsAfterRestart(current, thread.id));
      input.setWorkflowRevisionSource(undefined);
    } catch (error) {
      input.onWorkflowErrorChanged(workflowDiscoveryErrorMessage(error));
      try {
        await input.refreshAutomationFolders();
      } catch {
        // Preserve the provider error above; refresh is best-effort.
      }
    } finally {
      input.setWorkflowDiscoveryBusy(undefined);
    }
  }

  async function resolveWorkflowDiscoveryAccessRequest(
    questionId: string,
    accessRequestId: string,
    response: PermissionPromptResponseMode,
  ) {
    input.setWorkflowDiscoveryBusy(`access:${questionId}:${accessRequestId}`);
    input.onWorkflowErrorChanged(undefined);
    try {
      const result = await window.ambientDesktop.resolveWorkflowDiscoveryAccessRequest({ questionId, accessRequestId, response });
      input.onWorkflowAgentFoldersChanged(result.folders);
      input.onSelectWorkflowAgentThread(result.thread);
    } catch (error) {
      input.onWorkflowErrorChanged(workflowDiscoveryErrorMessage(error));
    } finally {
      input.setWorkflowDiscoveryBusy(undefined);
    }
  }

  function workflowExplorationBudgetsForThread(threadId: string): WorkflowExplorationBudgets {
    return normalizeWorkflowExplorationBudgets(input.workflowExplorationBudgetsByThreadId[threadId]);
  }

  function updateWorkflowExplorationBudget(threadId: string, field: keyof WorkflowExplorationBudgets, value: unknown) {
    input.setWorkflowExplorationBudgetsByThreadId((current) => workflowExplorationBudgetsAfterUpdate(current, threadId, field, value));
  }

  function resetWorkflowExplorationBudget(threadId: string) {
    input.setWorkflowExplorationBudgetsByThreadId((current) => workflowExplorationBudgetsAfterReset(current, threadId));
  }

  async function runWorkflowExplorationForThread(thread: WorkflowAgentThreadSummary) {
    input.onWorkflowBusyChanged(`exploration:${thread.id}`);
    input.onWorkflowErrorChanged(undefined);
    input.setWorkflowExplorationSkippedByThreadId((current) => workflowExplorationSkipsAfterRunStart(current, thread.id));
    try {
      const budgets = workflowExplorationBudgetsForThread(thread.id);
      const result = await window.ambientDesktop.runWorkflowThreadExploration(workflowExplorationRunInput(thread.id, budgets));
      input.onWorkflowAgentFoldersChanged(result.folders);
      input.onSelectWorkflowAgentThread(result.thread);
      input.onWorkflowExplorationTracesChanged((current) => workflowExplorationTracesAfterRunResult(current, thread.id, result.trace));
      await input.loadWorkflowExplorationTraces(thread.id);
      await input.loadWorkflowVersions(thread.id);
    } catch (error) {
      input.onWorkflowErrorChanged(workflowDiscoveryErrorMessage(error));
      await input.loadWorkflowExplorationTraces(thread.id);
    } finally {
      input.onWorkflowBusyChanged(undefined);
    }
  }

  function skipWorkflowExplorationForThread(thread: WorkflowAgentThreadSummary) {
    input.setWorkflowExplorationSkippedByThreadId((current) => workflowExplorationSkipsAfterSkip(current, thread.id));
    input.onWorkflowArtifactPanelChanged(thread.id, "exploration");
  }

  async function compileWorkflowThreadPreview(thread: WorkflowAgentThreadSummary, revision?: WorkflowRevisionSummary) {
    const userRequest = (revision?.requestedChange ?? thread.initialRequest).trim();
    if (!userRequest) return;
    input.onWorkflowBusyChanged("compile");
    input.setWorkflowCompileThreadId(thread.id);
    input.onWorkflowErrorChanged(undefined);
    input.onWorkflowCompileProgressReset();
    try {
      const dashboard = await window.ambientDesktop.compileWorkflowPreview({
        userRequest,
        workflowThreadId: thread.id,
        revisionId: revision?.id,
      });
      input.onWorkflowDashboardChanged(dashboard);
      await input.refreshAutomationFolders();
      const nextThread = (await window.ambientDesktop.listWorkflowAgentFolders())
        .flatMap((folder) => folder.threads)
        .find((candidate) => candidate.id === thread.id);
      if (nextThread) input.onSelectWorkflowAgentThread(nextThread);
      await input.loadWorkflowRevisions(thread.id);
      await input.loadWorkflowVersions(thread.id);
      const newestArtifact = dashboard.artifacts.find((artifact) => artifact.workflowThreadId === thread.id) ?? dashboard.artifacts[0];
      const newestRun = newestArtifact ? latestWorkflowRunForArtifact(dashboard.runs, newestArtifact.id) : dashboard.runs[0];
      if (newestRun) await input.onOpenWorkflowRunDetail(newestRun.id);
    } catch (error) {
      input.onWorkflowErrorChanged(workflowDiscoveryErrorMessage(error));
    } finally {
      input.onWorkflowBusyChanged(undefined);
    }
  }

  async function startWorkflowArtifactRevision(artifact: WorkflowArtifactSummary) {
    if (!artifact.workflowThreadId) return;
    input.onWorkflowBusyChanged(`revision-discovery:${artifact.id}`);
    input.onWorkflowErrorChanged(undefined);
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
      input.onWorkflowAgentFoldersChanged(result.folders);
      input.onSelectWorkflowAgentThread(result.thread);
      await input.loadWorkflowRevisions(result.thread.id);
      input.setWorkflowRequest("");
      input.setWorkflowRevisionSource(undefined);
    } catch (error) {
      input.onWorkflowErrorChanged(workflowDiscoveryErrorMessage(error));
    } finally {
      input.onWorkflowBusyChanged(undefined);
    }
  }

  function clearWorkflowRevisionDraft() {
    input.setWorkflowRequest("");
    input.setWorkflowRevisionSource(undefined);
  }

  function focusWorkflowRequestEditor() {
    input.workflowRequestRef.current?.scrollIntoView({ block: "center", behavior: "smooth" });
    input.workflowRequestRef.current?.focus();
  }

  async function openWorkflowCompileDiagnostics(path: string) {
    input.onWorkflowErrorChanged(undefined);
    try {
      await window.ambientDesktop.openLocalPath(path);
    } catch (error) {
      input.onWorkflowErrorChanged(workflowDiscoveryErrorMessage(error));
    }
  }

  async function copyWorkflowCompileFailureReport(reportText: string) {
    try {
      await window.ambientDesktop.writeClipboardText(reportText);
      input.onWorkflowErrorChanged(undefined);
    } catch (error) {
      input.onWorkflowErrorChanged(workflowDiscoveryErrorMessage(error));
    }
  }

  return {
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
