import type { MutableRefObject } from "react";

import type { WorkflowAgentFolderSummary, WorkflowAgentThreadSummary, WorkflowArtifactSummary, WorkflowConnectorDataRetention, WorkflowConnectorManifestGrant, WorkflowDashboard, WorkflowRecoveryAction, WorkflowRunDetail, WorkflowRunLimitOverrides, WorkflowUserInputResponse, WorkflowVersionSummary } from "../../shared/workflowTypes";
import type { WorkflowGraphEventCard } from "./workflowAgentGraphUiModel";
import { latestWorkflowRunForArtifact } from "./AutomationsWorkflowDiscoveryController";
import type { WorkflowRuntimeInputCard } from "./workflowRuntimeInputUiModel";
import {
  workflowExtendTotalRunLimitOverrides,
  workflowRemoveTotalRunLimitOverrides,
  workflowRunLimitOverridesForSettings,
  type WorkflowRunTotalLimitMode,
} from "./workflowRunLimitsUiModel";

export type WorkflowArtifactRunLimitSettings = {
  idleTimeoutMs: number;
  totalLimitMode: WorkflowRunTotalLimitMode;
};

export type WorkflowRunArtifactBusyKeyInput = {
  artifactId: string;
  mode: "execute" | "dry_run";
  resumeFromRunId?: string;
};

export function workflowRunLimitOverridesForArtifact(
  settings: WorkflowArtifactRunLimitSettings,
  artifact: Pick<WorkflowArtifactSummary, "manifest">,
): WorkflowRunLimitOverrides {
  return workflowRunLimitOverridesForSettings(settings, artifact.manifest);
}

export function workflowTotalRuntimeResumeOverrides(
  settings: WorkflowArtifactRunLimitSettings,
  action: "extend_total_runtime" | "remove_total_runtime_cap",
): WorkflowRunLimitOverrides {
  return action === "extend_total_runtime"
    ? workflowExtendTotalRunLimitOverrides(settings)
    : workflowRemoveTotalRunLimitOverrides(settings);
}

export function workflowRunArtifactBusyKey(input: WorkflowRunArtifactBusyKeyInput): string {
  return input.resumeFromRunId ? `resume:${input.resumeFromRunId}` : `${input.mode}:${input.artifactId}`;
}

function messageForError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function useAutomationsWorkflowArtifactController({
  selectedWorkflowAgentThread,
  workflowDetailRunIdRef,
  workflowRunIdleTimeoutMs,
  workflowRunTotalLimitMode,
  onWorkflowBusyChanged,
  onWorkflowErrorChanged,
  onWorkflowDashboardChanged,
  onWorkflowDetailChanged,
  onWorkflowCompileProgressReset,
  refreshAutomationFolders,
  loadWorkflowDashboard,
  loadWorkflowVersions,
  loadWorkflowThreadChatMessages,
  onWorkflowRevisionChanged,
  onSelectWorkflowAgentThread,
  onOpenWorkflowRunDetail,
  onWorkflowSourceDraftClear,
  workflowArtifactForRecovery,
}: {
  selectedWorkflowAgentThread?: WorkflowAgentThreadSummary;
  workflowDetailRunIdRef: MutableRefObject<string | undefined>;
  workflowRunIdleTimeoutMs: number;
  workflowRunTotalLimitMode: WorkflowRunTotalLimitMode;
  onWorkflowBusyChanged: (busy: string | undefined) => void;
  onWorkflowErrorChanged: (message: string | undefined) => void;
  onWorkflowDashboardChanged: (dashboard: WorkflowDashboard) => void;
  onWorkflowDetailChanged: (detail: WorkflowRunDetail | undefined) => void;
  onWorkflowCompileProgressReset: () => void;
  refreshAutomationFolders: () => Promise<{ workflowAgentFolders: WorkflowAgentFolderSummary[] }>;
  loadWorkflowDashboard: () => Promise<unknown>;
  loadWorkflowVersions: (workflowThreadId?: string) => Promise<unknown>;
  loadWorkflowThreadChatMessages: (threadId?: string) => Promise<unknown>;
  onWorkflowRevisionChanged: () => void;
  onSelectWorkflowAgentThread: (thread: WorkflowAgentThreadSummary) => void;
  onOpenWorkflowRunDetail: (runId: string) => Promise<void>;
  onWorkflowSourceDraftClear: (artifactId: string) => void;
  workflowArtifactForRecovery: (artifactId: string) => WorkflowArtifactSummary | undefined;
}) {
  const runLimitSettings = {
    idleTimeoutMs: workflowRunIdleTimeoutMs,
    totalLimitMode: workflowRunTotalLimitMode,
  };

  function runLimitsForArtifact(artifact: Pick<WorkflowArtifactSummary, "manifest">): WorkflowRunLimitOverrides {
    return workflowRunLimitOverridesForArtifact(runLimitSettings, artifact);
  }

  async function refreshDetailIfStillLoaded(dashboard: WorkflowDashboard) {
    const detailRunId = workflowDetailRunIdRef.current;
    if (detailRunId && dashboard.runs.some((run) => run.id === detailRunId)) {
      onWorkflowDetailChanged(await window.ambientDesktop.getWorkflowRunDetail({ runId: detailRunId }));
    }
  }

  async function reviewWorkflowArtifact(artifactId: string, decision: "approved" | "rejected") {
    onWorkflowBusyChanged(`review:${artifactId}:${decision}`);
    onWorkflowErrorChanged(undefined);
    try {
      const dashboard = await window.ambientDesktop.reviewWorkflowArtifact({ artifactId, decision });
      onWorkflowDashboardChanged(dashboard);
      await refreshAutomationFolders();
    } catch (error) {
      onWorkflowErrorChanged(messageForError(error));
    } finally {
      onWorkflowBusyChanged(undefined);
    }
  }

  async function updateWorkflowConnectorRetention(artifactId: string, connector: WorkflowConnectorManifestGrant, dataRetention: WorkflowConnectorDataRetention) {
    onWorkflowBusyChanged(`connector:${artifactId}:${connector.connectorId}:${dataRetention}`);
    onWorkflowErrorChanged(undefined);
    try {
      const dashboard = await window.ambientDesktop.updateWorkflowConnectorGrant({
        artifactId,
        connectorId: connector.connectorId,
        accountId: connector.accountId,
        dataRetention,
      });
      onWorkflowDashboardChanged(dashboard);
      await refreshDetailIfStillLoaded(dashboard);
      await refreshAutomationFolders();
    } catch (error) {
      onWorkflowErrorChanged(messageForError(error));
    } finally {
      onWorkflowBusyChanged(undefined);
    }
  }

  async function updateWorkflowConnectorAccount(artifactId: string, connector: WorkflowConnectorManifestGrant, nextAccountId: string) {
    onWorkflowBusyChanged(`connector:${artifactId}:${connector.connectorId}:account`);
    onWorkflowErrorChanged(undefined);
    try {
      const dashboard = await window.ambientDesktop.updateWorkflowConnectorGrant({
        artifactId,
        connectorId: connector.connectorId,
        accountId: connector.accountId,
        nextAccountId,
      });
      onWorkflowDashboardChanged(dashboard);
      await refreshDetailIfStillLoaded(dashboard);
      onWorkflowSourceDraftClear(artifactId);
      await refreshAutomationFolders();
    } catch (error) {
      onWorkflowErrorChanged(messageForError(error));
    } finally {
      onWorkflowBusyChanged(undefined);
    }
  }

  async function rejectWorkflowConnectorGrant(artifactId: string, connector: WorkflowConnectorManifestGrant) {
    onWorkflowBusyChanged(`connector:${artifactId}:${connector.connectorId}:rejected`);
    onWorkflowErrorChanged(undefined);
    try {
      const dashboard = await window.ambientDesktop.updateWorkflowConnectorGrant({
        artifactId,
        connectorId: connector.connectorId,
        accountId: connector.accountId,
        decision: "rejected",
      });
      onWorkflowDashboardChanged(dashboard);
      await refreshDetailIfStillLoaded(dashboard);
      await refreshAutomationFolders();
    } catch (error) {
      onWorkflowErrorChanged(messageForError(error));
    } finally {
      onWorkflowBusyChanged(undefined);
    }
  }

  async function removeWorkflowConnectorScope(artifactId: string, connector: WorkflowConnectorManifestGrant, scope: string) {
    onWorkflowBusyChanged(`connector:${artifactId}:${connector.connectorId}:scope:${scope}`);
    onWorkflowErrorChanged(undefined);
    try {
      const dashboard = await window.ambientDesktop.updateWorkflowConnectorGrant({
        artifactId,
        connectorId: connector.connectorId,
        accountId: connector.accountId,
        removeScope: scope,
      });
      onWorkflowDashboardChanged(dashboard);
      await refreshDetailIfStillLoaded(dashboard);
      await refreshAutomationFolders();
    } catch (error) {
      onWorkflowErrorChanged(messageForError(error));
    } finally {
      onWorkflowBusyChanged(undefined);
    }
  }

  async function revalidateWorkflowArtifactPreview(artifactId: string) {
    onWorkflowBusyChanged(`revalidate:${artifactId}`);
    onWorkflowErrorChanged(undefined);
    try {
      const dashboard = await window.ambientDesktop.revalidateWorkflowArtifact({ artifactId });
      onWorkflowDashboardChanged(dashboard);
      await refreshDetailIfStillLoaded(dashboard);
      await refreshAutomationFolders();
    } catch (error) {
      onWorkflowErrorChanged(messageForError(error));
    } finally {
      onWorkflowBusyChanged(undefined);
    }
  }

  async function saveWorkflowArtifactSource(artifactId: string, source: string) {
    onWorkflowBusyChanged(`source:${artifactId}`);
    onWorkflowErrorChanged(undefined);
    try {
      const dashboard = await window.ambientDesktop.updateWorkflowArtifactSource({ artifactId, source });
      onWorkflowDashboardChanged(dashboard);
      await refreshDetailIfStillLoaded(dashboard);
      await refreshAutomationFolders();
    } catch (error) {
      onWorkflowErrorChanged(messageForError(error));
    } finally {
      onWorkflowBusyChanged(undefined);
    }
  }

  async function runWorkflowArtifact(
    artifactId: string,
    mode: "execute" | "dry_run",
    options: { resumeFromRunId?: string; allowUnapproved?: boolean; runLimits?: WorkflowRunLimitOverrides; userInputs?: WorkflowUserInputResponse[] } = {},
  ): Promise<boolean> {
    const { resumeFromRunId, allowUnapproved = false, runLimits, userInputs } = options;
    onWorkflowBusyChanged(workflowRunArtifactBusyKey({ artifactId, mode, resumeFromRunId }));
    onWorkflowErrorChanged(undefined);
    try {
      const dashboard = await window.ambientDesktop.runWorkflowArtifact({ artifactId, mode, runtime: "workflow", resumeFromRunId, allowUnapproved, runLimits, userInputs });
      onWorkflowDashboardChanged(dashboard);
      await refreshAutomationFolders();
      const latestRun = latestWorkflowRunForArtifact(dashboard.runs, artifactId);
      if (latestRun) await onOpenWorkflowRunDetail(latestRun.id);
      return true;
    } catch (error) {
      onWorkflowErrorChanged(messageForError(error));
      return false;
    } finally {
      onWorkflowBusyChanged(undefined);
    }
  }

  async function answerWorkflowRuntimeInput(detail: WorkflowRunDetail, card: WorkflowRuntimeInputCard, response: Omit<WorkflowUserInputResponse, "requestId">): Promise<boolean> {
    return runWorkflowArtifact(detail.artifact.id, "execute", {
      resumeFromRunId: detail.run.id,
      allowUnapproved: detail.artifact.status !== "approved",
      runLimits: runLimitsForArtifact(detail.artifact),
      userInputs: [{ requestId: card.requestId, ...response }],
    });
  }

  async function resumeWorkflowTotalRuntimePause(detail: WorkflowRunDetail, action: "extend_total_runtime" | "remove_total_runtime_cap"): Promise<boolean> {
    return runWorkflowArtifact(detail.artifact.id, "execute", {
      resumeFromRunId: detail.run.id,
      allowUnapproved: detail.artifact.status !== "approved",
      runLimits: workflowTotalRuntimeResumeOverrides(runLimitSettings, action),
    });
  }

  async function recoverWorkflowRun(card: WorkflowGraphEventCard, action: WorkflowRecoveryAction): Promise<boolean> {
    onWorkflowBusyChanged(`recover:${action}:${card.id}`);
    onWorkflowErrorChanged(undefined);
    try {
      const artifact = workflowArtifactForRecovery(card.artifactId);
      const dashboard = await window.ambientDesktop.recoverWorkflowRun({
        runId: card.runId,
        eventId: card.id,
        action,
        graphNodeId: card.graphNodeId,
        itemKey: card.itemKey,
        allowUnapproved: artifact ? artifact.status !== "approved" : false,
      });
      onWorkflowDashboardChanged(dashboard);
      await refreshAutomationFolders();
      const latestRun = latestWorkflowRunForArtifact(dashboard.runs, card.artifactId);
      if (latestRun) await onOpenWorkflowRunDetail(latestRun.id);
      return true;
    } catch (error) {
      onWorkflowErrorChanged(messageForError(error));
      return false;
    } finally {
      onWorkflowBusyChanged(undefined);
    }
  }

  async function debugRewriteWorkflowRun(card: WorkflowGraphEventCard): Promise<boolean> {
    onWorkflowBusyChanged(`debug-rewrite:${card.id}`);
    onWorkflowErrorChanged(undefined);
    onWorkflowCompileProgressReset();
    try {
      const dashboard = await window.ambientDesktop.compileWorkflowDebugRewrite({
        runId: card.runId,
        eventId: card.id,
        userNotes: [
          "User chose Ask Ambient to debug from the workflow diagram.",
          card.graphNodeId ? `Selected graph node: ${card.graphNodeId}.` : undefined,
          card.itemKey ? `Selected item: ${card.itemKey}.` : undefined,
          card.detail ? `Visible failure detail: ${card.detail}` : undefined,
        ]
          .filter((line): line is string => Boolean(line))
          .join("\n"),
      });
      onWorkflowDashboardChanged(dashboard);
      await refreshAutomationFolders();
      onWorkflowRevisionChanged();
      const newestArtifact = dashboard.artifacts.find((artifact) => artifact.workflowThreadId === selectedWorkflowAgentThread?.id) ?? dashboard.artifacts[0];
      const newestRun = newestArtifact ? latestWorkflowRunForArtifact(dashboard.runs, newestArtifact.id) : dashboard.runs[0];
      if (newestRun) await onOpenWorkflowRunDetail(newestRun.id);
      return true;
    } catch (error) {
      onWorkflowErrorChanged(messageForError(error));
      return false;
    } finally {
      onWorkflowBusyChanged(undefined);
    }
  }

  async function resolveWorkflowRevisionProposal(revisionId: string, decision: "applied" | "rejected") {
    onWorkflowBusyChanged(`revision:${revisionId}:${decision}`);
    onWorkflowErrorChanged(undefined);
    try {
      await window.ambientDesktop.resolveWorkflowRevision({ id: revisionId, decision });
      onWorkflowRevisionChanged();
      await Promise.all([loadWorkflowDashboard(), refreshAutomationFolders(), loadWorkflowThreadChatMessages(selectedWorkflowAgentThread?.id)]);
      if (selectedWorkflowAgentThread) {
        const nextThread = (await window.ambientDesktop.listWorkflowAgentFolders())
          .flatMap((folder) => folder.threads)
          .find((candidate) => candidate.id === selectedWorkflowAgentThread.id);
        if (nextThread) onSelectWorkflowAgentThread(nextThread);
      }
    } catch (error) {
      onWorkflowErrorChanged(messageForError(error));
    } finally {
      onWorkflowBusyChanged(undefined);
    }
  }

  async function restoreWorkflowVersionForReview(version: WorkflowVersionSummary, approveRestored = false) {
    onWorkflowBusyChanged(`restore-version:${version.id}:${approveRestored ? "approved" : "review"}`);
    onWorkflowErrorChanged(undefined);
    try {
      const dashboard = await window.ambientDesktop.restoreWorkflowVersion({ versionId: version.id, approveRestored });
      onWorkflowDashboardChanged(dashboard);
      const refreshed = await refreshAutomationFolders();
      const nextThread = refreshed.workflowAgentFolders
        .flatMap((folder) => folder.threads)
        .find((candidate) => candidate.id === version.workflowThreadId);
      if (nextThread) onSelectWorkflowAgentThread(nextThread);
      await loadWorkflowVersions(version.workflowThreadId);
      onWorkflowRevisionChanged();
      const restoredArtifactId = nextThread?.activeArtifactId ?? version.artifactId;
      const latestRun = latestWorkflowRunForArtifact(dashboard.runs, restoredArtifactId);
      if (latestRun) await onOpenWorkflowRunDetail(latestRun.id);
    } catch (error) {
      onWorkflowErrorChanged(messageForError(error));
    } finally {
      onWorkflowBusyChanged(undefined);
    }
  }

  async function cancelWorkflowRun(runId: string) {
    onWorkflowBusyChanged(`cancel:${runId}`);
    onWorkflowErrorChanged(undefined);
    try {
      onWorkflowDashboardChanged(await window.ambientDesktop.cancelWorkflowRun({ runId }));
      await refreshAutomationFolders();
    } catch (error) {
      onWorkflowErrorChanged(messageForError(error));
    } finally {
      onWorkflowBusyChanged(undefined);
    }
  }

  async function resolveWorkflowApproval(runId: string, approvalId: string, decision: "approved" | "rejected") {
    onWorkflowBusyChanged(`approval:${approvalId}`);
    onWorkflowErrorChanged(undefined);
    try {
      onWorkflowDetailChanged(await window.ambientDesktop.resolveWorkflowApproval({ runId, approvalId, decision }));
      await refreshAutomationFolders();
    } catch (error) {
      onWorkflowErrorChanged(messageForError(error));
    } finally {
      onWorkflowBusyChanged(undefined);
    }
  }

  return {
    runLimitsForArtifact,
    reviewWorkflowArtifact,
    updateWorkflowConnectorRetention,
    updateWorkflowConnectorAccount,
    rejectWorkflowConnectorGrant,
    removeWorkflowConnectorScope,
    revalidateWorkflowArtifactPreview,
    saveWorkflowArtifactSource,
    runWorkflowArtifact,
    answerWorkflowRuntimeInput,
    resumeWorkflowTotalRuntimePause,
    recoverWorkflowRun,
    debugRewriteWorkflowRun,
    resolveWorkflowRevisionProposal,
    restoreWorkflowVersionForReview,
    cancelWorkflowRun,
    resolveWorkflowApproval,
  };
}
