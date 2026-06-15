import { useEffect, useMemo, useState } from "react";

import {
  decodeWorkflowSourceDrafts,
  encodeWorkflowSourceDrafts,
  workflowSourceDraftStorageKey,
} from "./automationUiModel";
import {
  workflowArtifactPanelStateForBuildPanel,
  workflowSplitLayoutStyle,
  type WorkflowSplitLayoutStyle,
} from "./AutomationsWorkflowPanelRouting";
import type {
  WorkflowArtifactPanelId,
  WorkflowBuildPanelId,
} from "./workflowArtifactPanelUiModel";
import type { WorkflowRunsPanelId } from "./workflowRunsPanelUiModel";

export type WorkflowSourceDraftStorage = Pick<Storage, "getItem" | "removeItem" | "setItem">;

export function defaultWorkflowSourceDraftStorage(): WorkflowSourceDraftStorage | undefined {
  if (typeof window === "undefined") return undefined;
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
}

export function workflowSourceDraftsFromStorage(storage: WorkflowSourceDraftStorage | undefined): Record<string, string> {
  if (!storage) return {};
  try {
    return decodeWorkflowSourceDrafts(storage.getItem(workflowSourceDraftStorageKey));
  } catch {
    return {};
  }
}

export function persistWorkflowSourceDrafts(storage: WorkflowSourceDraftStorage | undefined, drafts: Record<string, string>): void {
  if (!storage) return;
  try {
    const encodedDrafts = encodeWorkflowSourceDrafts(drafts);
    if (encodedDrafts === "{}") {
      storage.removeItem(workflowSourceDraftStorageKey);
    } else {
      storage.setItem(workflowSourceDraftStorageKey, encodedDrafts);
    }
  } catch {
    // localStorage is best-effort; in-memory drafts still protect the current session.
  }
}

export function workflowSourceDraftsWithChange(
  current: Record<string, string>,
  artifactId: string,
  source: string,
): Record<string, string> {
  return { ...current, [artifactId]: source };
}

export function workflowSourceDraftsWithoutArtifact(
  current: Record<string, string>,
  artifactId: string,
): Record<string, string> {
  const next = { ...current };
  delete next[artifactId];
  return next;
}

export function workflowThreadPanelStateWithPanel<TPanel>(
  current: Record<string, TPanel>,
  workflowThreadId: string | undefined,
  panel: TPanel,
): Record<string, TPanel> {
  if (!workflowThreadId) return current;
  return { ...current, [workflowThreadId]: panel };
}

export function useAutomationsWorkflowWorkspaceController({
  selectedWorkflowAgentThreadId,
  sourceDraftStorage = defaultWorkflowSourceDraftStorage(),
  initialSplitPercent = 58,
}: {
  selectedWorkflowAgentThreadId?: string;
  sourceDraftStorage?: WorkflowSourceDraftStorage;
  initialSplitPercent?: number;
}) {
  const [workflowArtifactPanelByThreadId, setWorkflowArtifactPanelByThreadId] = useState<Record<string, WorkflowArtifactPanelId>>({});
  const [workflowRunsPanelByThreadId, setWorkflowRunsPanelByThreadId] = useState<Record<string, WorkflowRunsPanelId>>({});
  const [selectedWorkflowGraphNodeId, setSelectedWorkflowGraphNodeId] = useState<string | undefined>();
  const [workflowSplitPercent, setWorkflowSplitPercent] = useState(initialSplitPercent);
  const [workflowSourceDrafts, setWorkflowSourceDrafts] = useState<Record<string, string>>(() =>
    workflowSourceDraftsFromStorage(sourceDraftStorage),
  );
  const workflowDiscoveryLayoutStyle: WorkflowSplitLayoutStyle = useMemo(
    () => workflowSplitLayoutStyle(workflowSplitPercent),
    [workflowSplitPercent],
  );

  useEffect(() => {
    setSelectedWorkflowGraphNodeId(undefined);
  }, [selectedWorkflowAgentThreadId]);

  useEffect(() => {
    persistWorkflowSourceDrafts(sourceDraftStorage, workflowSourceDrafts);
  }, [sourceDraftStorage, workflowSourceDrafts]);

  function setWorkflowArtifactPanel(workflowThreadId: string | undefined, panel: WorkflowArtifactPanelId) {
    setWorkflowArtifactPanelByThreadId((current) => workflowThreadPanelStateWithPanel(current, workflowThreadId, panel));
  }

  function setWorkflowRunsPanel(workflowThreadId: string | undefined, panel: WorkflowRunsPanelId) {
    setWorkflowRunsPanelByThreadId((current) => workflowThreadPanelStateWithPanel(current, workflowThreadId, panel));
  }

  function setWorkflowBuildPanel(workflowThreadId: string | undefined, panel: WorkflowBuildPanelId) {
    setWorkflowArtifactPanelByThreadId((current) => workflowArtifactPanelStateForBuildPanel(current, workflowThreadId, panel));
  }

  function setWorkflowSourceDraft(artifactId: string, source: string) {
    setWorkflowSourceDrafts((current) => workflowSourceDraftsWithChange(current, artifactId, source));
  }

  function clearWorkflowSourceDraft(artifactId: string) {
    setWorkflowSourceDrafts((current) => workflowSourceDraftsWithoutArtifact(current, artifactId));
  }

  return {
    workflowArtifactPanelByThreadId,
    workflowRunsPanelByThreadId,
    selectedWorkflowGraphNodeId,
    setSelectedWorkflowGraphNodeId,
    workflowSplitPercent,
    setWorkflowSplitPercent,
    workflowDiscoveryLayoutStyle,
    workflowSourceDrafts,
    setWorkflowSourceDraft,
    clearWorkflowSourceDraft,
    setWorkflowArtifactPanel,
    setWorkflowRunsPanel,
    setWorkflowBuildPanel,
  };
}
