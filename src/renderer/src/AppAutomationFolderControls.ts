import type { Dispatch, SetStateAction } from "react";

import type {
  AutomationFolderSummary,
  WorkflowAgentFolderSummary,
} from "../../shared/types";
import type { AutomationPopover } from "./AppSidebar";

type FolderWithThreads = {
  id: string;
  name: string;
  kind: string;
  threads: readonly { id: string }[];
};

export function fallbackFolderId<T extends { id: string }>(
  folders: readonly T[],
  fallback = "home",
): string {
  return folders[0]?.id ?? fallback;
}

export function folderContainsThread<T extends { threads: readonly { id: string }[] }>(
  folders: readonly T[],
  threadId: string,
): boolean {
  return folders.some((folder) => folder.threads.some((thread) => thread.id === threadId));
}

export function createdCustomFolderId<T extends FolderWithThreads>(
  folders: readonly T[],
  name: string,
): string {
  return folders.find((folder) => folder.name === name && folder.kind === "custom")?.id ?? fallbackFolderId(folders);
}

export function folderNameForCreate(name: string): string | undefined {
  const trimmed = name.trim();
  return trimmed || undefined;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function createAppAutomationFolderControls({
  selectedAutomationFolderId,
  selectedAutomationThreadId,
  selectedWorkflowAgentFolderId,
  selectedWorkflowAgentThreadId,
  setAutomationFolders,
  setAutomationNavigationError,
  setAutomationPopover,
  setSelectedAutomationFolderId,
  setSelectedAutomationThreadId,
  setSelectedWorkflowAgentFolderId,
  setSelectedWorkflowAgentThreadId,
  setWorkflowAgentFolders,
  setWorkflowAgentNavigationError,
}: {
  selectedAutomationFolderId: string;
  selectedAutomationThreadId: string | undefined;
  selectedWorkflowAgentFolderId: string;
  selectedWorkflowAgentThreadId: string | undefined;
  setAutomationFolders: Dispatch<SetStateAction<AutomationFolderSummary[]>>;
  setAutomationNavigationError: Dispatch<SetStateAction<string | undefined>>;
  setAutomationPopover: Dispatch<SetStateAction<AutomationPopover | undefined>>;
  setSelectedAutomationFolderId: Dispatch<SetStateAction<string>>;
  setSelectedAutomationThreadId: Dispatch<SetStateAction<string | undefined>>;
  setSelectedWorkflowAgentFolderId: Dispatch<SetStateAction<string>>;
  setSelectedWorkflowAgentThreadId: Dispatch<SetStateAction<string | undefined>>;
  setWorkflowAgentFolders: Dispatch<SetStateAction<WorkflowAgentFolderSummary[]>>;
  setWorkflowAgentNavigationError: Dispatch<SetStateAction<string | undefined>>;
}): {
  createAutomationFolder: (name: string) => Promise<void>;
  createWorkflowAgentFolder: (name: string) => Promise<void>;
  loadAutomationFolders: () => Promise<void>;
  loadWorkflowAgentFolders: () => Promise<void>;
  moveAutomationThread: (threadId: string, folderId: string) => Promise<void>;
  moveWorkflowAgentThread: (threadId: string, folderId: string) => Promise<void>;
} {
  async function loadAutomationFolders(): Promise<void> {
    setAutomationNavigationError(undefined);
    try {
      const folders = await window.ambientDesktop.listAutomationFolders();
      setAutomationFolders(folders);
      if (!folders.some((folder) => folder.id === selectedAutomationFolderId)) {
        setSelectedAutomationFolderId(fallbackFolderId(folders));
      }
      if (selectedAutomationThreadId && !folderContainsThread(folders, selectedAutomationThreadId)) {
        setSelectedAutomationThreadId(undefined);
      }
    } catch (error) {
      setAutomationNavigationError(errorMessage(error));
    }
  }

  async function loadWorkflowAgentFolders(): Promise<void> {
    setWorkflowAgentNavigationError(undefined);
    try {
      const folders = await window.ambientDesktop.listWorkflowAgentFolders();
      setWorkflowAgentFolders(folders);
      if (!folders.some((folder) => folder.id === selectedWorkflowAgentFolderId)) {
        setSelectedWorkflowAgentFolderId(fallbackFolderId(folders));
      }
      if (selectedWorkflowAgentThreadId && !folderContainsThread(folders, selectedWorkflowAgentThreadId)) {
        setSelectedWorkflowAgentThreadId(undefined);
      }
    } catch (error) {
      setWorkflowAgentNavigationError(errorMessage(error));
    }
  }

  async function createWorkflowAgentFolder(name: string): Promise<void> {
    const trimmed = folderNameForCreate(name);
    if (!trimmed) return;
    setWorkflowAgentNavigationError(undefined);
    try {
      const folders = await window.ambientDesktop.createWorkflowAgentFolder({ name: trimmed });
      setWorkflowAgentFolders(folders);
      setSelectedWorkflowAgentFolderId(createdCustomFolderId(folders, trimmed));
      setSelectedWorkflowAgentThreadId(undefined);
      setAutomationPopover(undefined);
    } catch (error) {
      setWorkflowAgentNavigationError(errorMessage(error));
    }
  }

  async function moveWorkflowAgentThread(threadId: string, folderId: string): Promise<void> {
    setWorkflowAgentNavigationError(undefined);
    try {
      const folders = await window.ambientDesktop.moveWorkflowAgentThread({ threadId, folderId });
      setWorkflowAgentFolders(folders);
      setSelectedWorkflowAgentFolderId(folderId);
    } catch (error) {
      setWorkflowAgentNavigationError(errorMessage(error));
    }
  }

  async function createAutomationFolder(name: string): Promise<void> {
    const trimmed = folderNameForCreate(name);
    if (!trimmed) return;
    setAutomationNavigationError(undefined);
    try {
      const folders = await window.ambientDesktop.createAutomationFolder({ name: trimmed });
      setAutomationFolders(folders);
      setSelectedAutomationFolderId(createdCustomFolderId(folders, trimmed));
      setSelectedAutomationThreadId(undefined);
      setAutomationPopover(undefined);
    } catch (error) {
      setAutomationNavigationError(errorMessage(error));
    }
  }

  async function moveAutomationThread(threadId: string, folderId: string): Promise<void> {
    setAutomationNavigationError(undefined);
    try {
      const folders = await window.ambientDesktop.moveAutomationThread({ threadId, folderId });
      setAutomationFolders(folders);
      setSelectedAutomationFolderId(folderId);
    } catch (error) {
      setAutomationNavigationError(errorMessage(error));
    }
  }

  return {
    createAutomationFolder,
    createWorkflowAgentFolder,
    loadAutomationFolders,
    loadWorkflowAgentFolders,
    moveAutomationThread,
    moveWorkflowAgentThread,
  };
}
