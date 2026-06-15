import type { Dispatch, SetStateAction } from "react";

import type {
  AnswerPlannerDecisionQuestionInput,
  DesktopState,
  PlannerPlanArtifact,
  PlannerPlanWorkflowState,
  RunStatus,
  ThreadSummary,
} from "../../shared/types";
import type { PlannerRevisionDialogState } from "./AppActionDialogs";
import {
  plannerDecisionFinalizationPrompt,
  plannerDurableRevisionPrompt,
  plannerImplementationGoalMode,
  plannerImplementationPrompt,
  plannerRefinementPrompt,
  plannerRequiredDecisionQuestionsAnswered,
  plannerShouldAutoFinalizeAfterAnswer,
} from "./plannerModeUiModel";

export type AppPlannerThreadSettingsInput = Partial<
  Pick<ThreadSummary, "collaborationMode" | "model" | "thinkingLevel" | "memoryEnabled">
>;

export type AppPlannerThreadSettingsUpdater = (input: AppPlannerThreadSettingsInput) => Promise<ThreadSummary | undefined>;

export function plannerPlanArtifactsWithUpdated(
  artifacts: PlannerPlanArtifact[],
  updated: PlannerPlanArtifact,
): PlannerPlanArtifact[] {
  return artifacts.map((item) => (item.id === updated.id ? updated : item));
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function createAppPlannerActions({
  getComposerDraft,
  plannerRevisionDialog,
  resetRunActivityLines,
  running,
  setComposerDraft,
  setContextError,
  setError,
  setPlannerRevisionDialog,
  setRunStatus,
  setState,
  setThreadRunStatuses,
  state,
  updateThreadSettings,
}: {
  getComposerDraft: () => string;
  plannerRevisionDialog?: PlannerRevisionDialogState;
  resetRunActivityLines: (line: string) => void;
  running: boolean;
  setComposerDraft: (value: string) => void;
  setContextError: Dispatch<SetStateAction<string | undefined>>;
  setError: (message: string | undefined) => void;
  setPlannerRevisionDialog: Dispatch<SetStateAction<PlannerRevisionDialogState | undefined>>;
  setRunStatus: Dispatch<SetStateAction<RunStatus>>;
  setState: Dispatch<SetStateAction<DesktopState | undefined>>;
  setThreadRunStatuses: Dispatch<SetStateAction<Record<string, RunStatus>>>;
  state?: DesktopState;
  updateThreadSettings: AppPlannerThreadSettingsUpdater;
}) {
  function replacePlannerPlanArtifact(updated: PlannerPlanArtifact): void {
    setState((current) =>
      current
        ? {
            ...current,
            plannerPlanArtifacts: plannerPlanArtifactsWithUpdated(current.plannerPlanArtifacts, updated),
          }
        : current,
    );
  }

  function startPlannerRun(activityLine: string): void {
    if (!state) return;
    setError(undefined);
    setContextError(undefined);
    resetRunActivityLines(activityLine);
    setRunStatus("starting");
    setThreadRunStatuses((statuses) => ({ ...statuses, [state.activeThreadId]: "starting" }));
  }

  async function updatePlannerPlanWorkflowState(
    artifact: PlannerPlanArtifact,
    workflowState: PlannerPlanWorkflowState,
  ): Promise<PlannerPlanArtifact> {
    const updated = await window.ambientDesktop.updatePlannerPlanArtifact({ artifactId: artifact.id, workflowState });
    replacePlannerPlanArtifact(updated);
    return updated;
  }

  async function implementPlannerPlan(artifact: PlannerPlanArtifact): Promise<void> {
    if (!state || running) return;
    if (!plannerRequiredDecisionQuestionsAnswered(artifact)) {
      setError("Answer required planner decisions before implementing this plan.");
      return;
    }
    const content = plannerImplementationPrompt(artifact);
    startPlannerRun("Approved plan started as a goal implementation.");
    await updateThreadSettings({ collaborationMode: "agent" });
    await window.ambientDesktop
      .updatePlannerPlanArtifact({ artifactId: artifact.id, status: "implemented" })
      .then(replacePlannerPlanArtifact)
      .catch(() => undefined);
    await window.ambientDesktop
      .sendMessage({
        threadId: state.activeThreadId,
        content,
        permissionMode: state.settings.permissionMode,
        collaborationMode: "agent",
        goalMode: plannerImplementationGoalMode(),
        model: state.settings.model,
        thinkingLevel: state.settings.thinkingLevel,
        delivery: "prompt",
        context: [],
      })
      .catch((err) => {
        setError(errorMessage(err));
        setRunStatus("error");
      });
  }

  async function finalizePlannerPlan(artifact: PlannerPlanArtifact): Promise<void> {
    if (!state || running) return;
    const shouldMarkFinalizing = artifact.status === "ready" && plannerRequiredDecisionQuestionsAnswered(artifact);
    const promptArtifact =
      shouldMarkFinalizing && artifact.workflowState !== "finalizing"
        ? await updatePlannerPlanWorkflowState(artifact, "finalizing").catch(() => artifact)
        : artifact;
    const content =
      shouldMarkFinalizing && promptArtifact.decisionQuestions.some((question) => Boolean(question.answer))
        ? plannerDecisionFinalizationPrompt(promptArtifact)
        : plannerRefinementPrompt(promptArtifact);
    startPlannerRun(shouldMarkFinalizing ? "Plan finalization sent to Ambient." : "Plan refinement sent to Ambient.");
    await updateThreadSettings({ collaborationMode: "planner" });
    await window.ambientDesktop
      .sendMessage({
        threadId: state.activeThreadId,
        content,
        permissionMode: state.settings.permissionMode,
        collaborationMode: "planner",
        model: state.settings.model,
        thinkingLevel: state.settings.thinkingLevel,
        delivery: "prompt",
        context: [],
      })
      .catch((err) => {
        if (shouldMarkFinalizing) {
          void updatePlannerPlanWorkflowState(promptArtifact, "failed").catch(() => undefined);
        }
        setError(errorMessage(err));
        setRunStatus("error");
      });
  }

  function openPlannerRevisionDialog(artifact: PlannerPlanArtifact): void {
    if (running) return;
    setPlannerRevisionDialog({
      artifact,
      initialFeedback: getComposerDraft(),
    });
  }

  async function sendPlannerDurableRevision(
    artifact: PlannerPlanArtifact,
    feedback: string,
    options: { clearComposer?: boolean } = {},
  ): Promise<void> {
    if (!state || running) return;
    const trimmedFeedback = feedback.trim();
    if (!trimmedFeedback) throw new Error("Enter feedback for the plan revision.");
    const promptArtifact =
      artifact.status === "ready" && artifact.workflowState !== "finalizing"
        ? await updatePlannerPlanWorkflowState(artifact, "finalizing").catch(() => artifact)
        : artifact;
    const content = plannerDurableRevisionPrompt(promptArtifact, trimmedFeedback);
    startPlannerRun("Plan revision sent to Ambient.");
    try {
      await updateThreadSettings({ collaborationMode: "planner" });
      await window.ambientDesktop.sendMessage({
        threadId: state.activeThreadId,
        content,
        permissionMode: state.settings.permissionMode,
        collaborationMode: "planner",
        model: state.settings.model,
        thinkingLevel: state.settings.thinkingLevel,
        delivery: "prompt",
        context: [],
      });
      if (options.clearComposer) setComposerDraft("");
    } catch (err) {
      if (artifact.status === "ready") {
        void updatePlannerPlanWorkflowState(promptArtifact, "failed").catch(() => undefined);
      }
      setError(errorMessage(err));
      setRunStatus("error");
      throw err;
    }
  }

  async function submitPlannerRevisionDialog(feedback: string): Promise<void> {
    if (!plannerRevisionDialog || plannerRevisionDialog.busy) return;
    const dialog = plannerRevisionDialog;
    setPlannerRevisionDialog((current) => (current ? { ...current, busy: true, error: undefined } : current));
    try {
      await sendPlannerDurableRevision(dialog.artifact, feedback);
      setPlannerRevisionDialog(undefined);
    } catch (err) {
      const message = errorMessage(err);
      setPlannerRevisionDialog((current) => (current ? { ...current, busy: false, error: message } : current));
    }
  }

  async function answerPlannerDecisionQuestion(
    artifact: PlannerPlanArtifact,
    questionId: string,
    answer: AnswerPlannerDecisionQuestionInput["answer"],
  ): Promise<void> {
    setError(undefined);
    try {
      const updated = await window.ambientDesktop.answerPlannerDecisionQuestion({ artifactId: artifact.id, questionId, answer });
      replacePlannerPlanArtifact(updated);
      if (plannerShouldAutoFinalizeAfterAnswer(artifact, updated, state?.settings.planner.autoFinalize ?? true)) {
        await finalizePlannerPlan(updated);
      }
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  return {
    answerPlannerDecisionQuestion,
    finalizePlannerPlan,
    implementPlannerPlan,
    openPlannerRevisionDialog,
    sendPlannerDurableRevision,
    submitPlannerRevisionDialog,
    updatePlannerPlanWorkflowState,
  };
}
