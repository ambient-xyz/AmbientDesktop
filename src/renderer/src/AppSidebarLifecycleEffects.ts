import { useEffect } from "react";
import type { Dispatch, SetStateAction } from "react";

import type { ThreadKind } from "../../shared/types";
import type { SidebarArea } from "./AppShellSidebar";

export type PendingProjectComposerDraft = {
  value: string;
  nonce: number;
};

export type SubagentFallbackSelection = {
  threadId: string;
  workspacePath?: string;
};

export function shouldRefreshAutomationSidebar(sidebarArea: SidebarArea): boolean {
  return sidebarArea === "automations";
}

export function subagentFallbackSelection({
  activeThreadKind,
  activeThreadParentThreadId,
  activeThreadWorkspacePath,
  subagentUiEnabled,
  workspacePath,
}: {
  activeThreadKind: ThreadKind | undefined;
  activeThreadParentThreadId: string | undefined;
  activeThreadWorkspacePath: string | undefined;
  subagentUiEnabled: boolean;
  workspacePath: string | undefined;
}): SubagentFallbackSelection | undefined {
  if (subagentUiEnabled) return undefined;
  if (activeThreadKind !== "subagent_child" || !activeThreadParentThreadId) return undefined;
  return {
    threadId: activeThreadParentThreadId,
    workspacePath: activeThreadWorkspacePath || workspacePath,
  };
}

export function pendingProjectComposerDraftValue(
  pendingProjectComposerDraft: PendingProjectComposerDraft | undefined,
  sidebarArea: SidebarArea,
): string | undefined {
  if (!pendingProjectComposerDraft || sidebarArea !== "projects") return undefined;
  return pendingProjectComposerDraft.value;
}

function useAppAutomationSidebarLifecycleEffect({
  loadAutomationFolders,
  loadWorkflowAgentFolders,
  orchestrationAutoRevision,
  orchestrationRevision,
  sidebarArea,
  workflowRevision,
  workspacePath,
}: {
  loadAutomationFolders: () => void | Promise<void>;
  loadWorkflowAgentFolders: () => void | Promise<void>;
  orchestrationAutoRevision: number;
  orchestrationRevision: number;
  sidebarArea: SidebarArea;
  workflowRevision: number;
  workspacePath: string | undefined;
}): void {
  useEffect(() => {
    if (!shouldRefreshAutomationSidebar(sidebarArea)) return;
    void loadAutomationFolders();
    void loadWorkflowAgentFolders();
  }, [sidebarArea, workspacePath, orchestrationRevision, orchestrationAutoRevision, workflowRevision]);
}

function useAppSubagentFallbackLifecycleEffect({
  activeThreadId,
  activeThreadKind,
  activeThreadParentThreadId,
  activeThreadWorkspacePath,
  selectThread,
  setError,
  subagentUiEnabled,
  workspacePath,
}: {
  activeThreadId: string | undefined;
  activeThreadKind: ThreadKind | undefined;
  activeThreadParentThreadId: string | undefined;
  activeThreadWorkspacePath: string | undefined;
  selectThread: (threadId: string, workspacePath?: string) => Promise<void> | void;
  setError: (message: string | undefined) => void;
  subagentUiEnabled: boolean;
  workspacePath: string | undefined;
}): void {
  useEffect(() => {
    const fallback = subagentFallbackSelection({
      activeThreadKind,
      activeThreadParentThreadId,
      activeThreadWorkspacePath,
      subagentUiEnabled,
      workspacePath,
    });
    if (!fallback) return;
    void Promise.resolve(selectThread(fallback.threadId, fallback.workspacePath)).catch((error) => {
      setError(error instanceof Error ? error.message : String(error));
    });
  }, [activeThreadId, activeThreadKind, activeThreadParentThreadId, activeThreadWorkspacePath, workspacePath, subagentUiEnabled]);
}

function useAppPendingProjectComposerDraftLifecycleEffect({
  pendingProjectComposerDraft,
  setComposerDraft,
  setPendingProjectComposerDraft,
  sidebarArea,
}: {
  pendingProjectComposerDraft: PendingProjectComposerDraft | undefined;
  setComposerDraft: (value: string, options?: { focusEnd?: boolean }) => void;
  setPendingProjectComposerDraft: Dispatch<SetStateAction<PendingProjectComposerDraft | undefined>>;
  sidebarArea: SidebarArea;
}): void {
  useEffect(() => {
    const draft = pendingProjectComposerDraftValue(pendingProjectComposerDraft, sidebarArea);
    if (draft === undefined) return;
    const timer = window.setTimeout(() => {
      setComposerDraft(draft, { focusEnd: true });
      setPendingProjectComposerDraft(undefined);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [pendingProjectComposerDraft, sidebarArea]);
}

export function useAppSidebarLifecycleEffects({
  activeThreadId,
  activeThreadKind,
  activeThreadParentThreadId,
  activeThreadWorkspacePath,
  loadAutomationFolders,
  loadWorkflowAgentFolders,
  orchestrationAutoRevision,
  orchestrationRevision,
  pendingProjectComposerDraft,
  selectThread,
  setComposerDraft,
  setError,
  setPendingProjectComposerDraft,
  sidebarArea,
  subagentUiEnabled,
  workflowRevision,
  workspacePath,
}: {
  activeThreadId: string | undefined;
  activeThreadKind: ThreadKind | undefined;
  activeThreadParentThreadId: string | undefined;
  activeThreadWorkspacePath: string | undefined;
  loadAutomationFolders: () => void | Promise<void>;
  loadWorkflowAgentFolders: () => void | Promise<void>;
  orchestrationAutoRevision: number;
  orchestrationRevision: number;
  pendingProjectComposerDraft: PendingProjectComposerDraft | undefined;
  selectThread: (threadId: string, workspacePath?: string) => Promise<void> | void;
  setComposerDraft: (value: string, options?: { focusEnd?: boolean }) => void;
  setError: (message: string | undefined) => void;
  setPendingProjectComposerDraft: Dispatch<SetStateAction<PendingProjectComposerDraft | undefined>>;
  sidebarArea: SidebarArea;
  subagentUiEnabled: boolean;
  workflowRevision: number;
  workspacePath: string | undefined;
}): void {
  useAppAutomationSidebarLifecycleEffect({
    loadAutomationFolders,
    loadWorkflowAgentFolders,
    orchestrationAutoRevision,
    orchestrationRevision,
    sidebarArea,
    workflowRevision,
    workspacePath,
  });
  useAppSubagentFallbackLifecycleEffect({
    activeThreadId,
    activeThreadKind,
    activeThreadParentThreadId,
    activeThreadWorkspacePath,
    selectThread,
    setError,
    subagentUiEnabled,
    workspacePath,
  });
  useAppPendingProjectComposerDraftLifecycleEffect({
    pendingProjectComposerDraft,
    setComposerDraft,
    setPendingProjectComposerDraft,
    sidebarArea,
  });
}
