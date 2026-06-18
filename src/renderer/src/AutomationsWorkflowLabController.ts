import { useEffect, useRef, useState } from "react";

import type { DesktopState } from "../../shared/desktopTypes";
import type { CreateWorkflowLabRunInput, WorkflowLabRun, WorkflowRecordingLibraryEntry } from "../../shared/workflowTypes";
import type { ApiKeyStatus } from "./RightPanel";
import type { WorkflowLabBusy } from "./AutomationsWorkflowLabViews";

export function workflowLabInitialGoal(playbook: WorkflowRecordingLibraryEntry): string {
  return `Improve reliability for ${playbook.title}.`;
}

export function workflowLabCreateRunInput(playbook: WorkflowRecordingLibraryEntry, goal: string): CreateWorkflowLabRunInput {
  return {
    workflowId: playbook.id,
    goal: goal.trim() || workflowLabInitialGoal(playbook),
    metricEmphasis: "balanced",
    attemptBudget: 5,
    plateauThreshold: 0.03,
    heldOutEnabled: true,
  };
}

export function workflowLabCompletionStatus(run: WorkflowLabRun): ApiKeyStatus {
  const best = run.variants.find((variant) => variant.id === run.bestVariantId);
  return {
    kind: best ? "success" : "info",
    message: best ? `Best variant scored ${best.score ?? 0}/100.` : "Workflow Lab completed without an accepted candidate.",
  };
}

export function workflowLabRunningState(current: WorkflowLabRun | undefined, runId: string): WorkflowLabRun | undefined {
  return current?.id === runId ? { ...current, status: "running" } : current;
}

export function workflowLabProgressState(
  current: WorkflowLabRun | undefined,
  nextRun: WorkflowLabRun,
): WorkflowLabRun | undefined {
  return current?.id === nextRun.id ? nextRun : current;
}

export function useWorkflowLabController({
  selectedWorkflowRecording,
  onDesktopStateChanged,
}: {
  selectedWorkflowRecording?: WorkflowRecordingLibraryEntry;
  onDesktopStateChanged: (state: DesktopState) => void;
}) {
  const [run, setRun] = useState<WorkflowLabRun | undefined>();
  const [goal, setGoal] = useState("");
  const [busy, setBusy] = useState<WorkflowLabBusy | undefined>();
  const [status, setStatus] = useState<ApiKeyStatus | undefined>();
  const goalWorkflowIdRef = useRef<string | undefined>(undefined);

  useEffect(() => {
    let canceled = false;
    if (!selectedWorkflowRecording) {
      setRun(undefined);
      setGoal("");
      goalWorkflowIdRef.current = undefined;
      setStatus(undefined);
      return;
    }
    if (goalWorkflowIdRef.current !== selectedWorkflowRecording.id) {
      goalWorkflowIdRef.current = selectedWorkflowRecording.id;
      setGoal(workflowLabInitialGoal(selectedWorkflowRecording));
    }
    void window.ambientDesktop
      .listWorkflowLabRuns({ workflowId: selectedWorkflowRecording.id, limit: 1 })
      .then((runs) => {
        if (!canceled) setRun(runs[0]);
      })
      .catch((error) => {
        if (!canceled) setStatus({ kind: "error", message: error instanceof Error ? error.message : String(error) });
      });
    return () => {
      canceled = true;
    };
  }, [selectedWorkflowRecording?.id, selectedWorkflowRecording?.version]);

  function pollRunProgress(runId: string): number {
    const refresh = () => {
      void window.ambientDesktop
        .getWorkflowLabRun({ runId })
        .then((nextRun) => {
          setRun((current) => workflowLabProgressState(current, nextRun));
        })
        .catch(() => undefined);
    };
    refresh();
    return window.setInterval(refresh, 1500);
  }

  async function runVariants(nextRun: WorkflowLabRun): Promise<void> {
    setBusy("run");
    setStatus({ kind: "info", message: "Running Workflow Lab variants with deterministic gates and provider-backed judging when available." });
    setRun((current) => workflowLabRunningState(current, nextRun.id));
    const progressPoll = pollRunProgress(nextRun.id);
    try {
      const completedRun = await window.ambientDesktop.startWorkflowLabRun({ runId: nextRun.id });
      setRun(completedRun);
      setStatus(workflowLabCompletionStatus(completedRun));
    } catch (error) {
      setStatus({ kind: "error", message: error instanceof Error ? error.message : String(error) });
    } finally {
      window.clearInterval(progressPoll);
      setBusy(undefined);
    }
  }

  async function createRunForPlaybook(playbook: WorkflowRecordingLibraryEntry): Promise<void> {
    if (busy) return;
    setBusy("create");
    setStatus({ kind: "info", message: "Creating a fresh Workflow Lab run and evaluation cases." });
    try {
      const nextRun = await window.ambientDesktop.createWorkflowLabRun(workflowLabCreateRunInput(playbook, goal));
      setRun(nextRun);
      await runVariants(nextRun);
    } catch (error) {
      setStatus({ kind: "error", message: error instanceof Error ? error.message : String(error) });
      setBusy(undefined);
    }
  }

  async function startRun(): Promise<void> {
    if (!run || busy) return;
    await runVariants(run);
  }

  async function stopRun(): Promise<void> {
    if (!run || run.status !== "running") return;
    setStatus({ kind: "info", message: "Stop requested. The current evaluation will finish its bounded step first." });
    try {
      const stopped = await window.ambientDesktop.stopWorkflowLabRun({ runId: run.id });
      setRun(stopped);
    } catch (error) {
      setStatus({ kind: "error", message: error instanceof Error ? error.message : String(error) });
    }
  }

  async function adoptBestVariant(): Promise<void> {
    const bestVariantId = run?.bestVariantId;
    if (!run || !bestVariantId || busy) return;
    setBusy("adopt");
    setStatus(undefined);
    try {
      const nextState = await window.ambientDesktop.adoptWorkflowLabVariant({ runId: run.id, variantId: bestVariantId });
      onDesktopStateChanged(nextState);
      const refreshedRun = await window.ambientDesktop.getWorkflowLabRun({ runId: run.id });
      setRun(refreshedRun);
      setStatus({ kind: "success", message: "Accepted Workflow Lab variant adopted as a new playbook version." });
    } catch (error) {
      setStatus({ kind: "error", message: error instanceof Error ? error.message : String(error) });
    } finally {
      setBusy(undefined);
    }
  }

  return {
    workflowLabRun: run,
    workflowLabGoal: goal,
    setWorkflowLabGoal: setGoal,
    workflowLabBusy: busy,
    workflowLabStatus: status,
    createRunForPlaybook,
    startRun,
    stopRun,
    adoptBestVariant,
  };
}
