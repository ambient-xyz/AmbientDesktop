import type { Dispatch, SetStateAction } from "react";

import type { WorkspaceContextReference } from "../../shared/workspaceTypes";
import { contextAttachmentKey } from "./RightPanelDetailPanels";
import { mergeContextAttachments } from "./AppComposerControls";

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function contextAttachmentsWithoutItem(
  current: readonly WorkspaceContextReference[],
  item: WorkspaceContextReference,
): WorkspaceContextReference[] {
  const key = contextAttachmentKey(item);
  return current.filter((attachment) => contextAttachmentKey(attachment) !== key);
}

export function createAppContextAttachmentActions({
  allowExternalContext,
  openAttachmentsPanel,
  setContextAttachments,
  setContextError,
}: {
  allowExternalContext: boolean;
  openAttachmentsPanel: () => void;
  setContextAttachments: Dispatch<SetStateAction<WorkspaceContextReference[]>>;
  setContextError: Dispatch<SetStateAction<string | undefined>>;
}): {
  addContextAttachments: (items: WorkspaceContextReference[]) => void;
  attachComposerFiles: () => Promise<void>;
  clearContextAttachments: () => void;
  removeContextAttachment: (item: WorkspaceContextReference) => void;
} {
  function addContextAttachments(items: WorkspaceContextReference[]): void {
    if (items.length === 0) return;
    setContextError(undefined);
    setContextAttachments((current) => mergeContextAttachments(current, items));
  }

  async function attachComposerFiles(): Promise<void> {
    setContextError(undefined);
    try {
      const selected = await window.ambientDesktop.pickWorkspaceContext({
        kind: "file",
        allowExternal: allowExternalContext,
      });
      addContextAttachments(selected);
    } catch (error) {
      setContextError(errorMessage(error));
      openAttachmentsPanel();
    }
  }

  function clearContextAttachments(): void {
    setContextAttachments([]);
  }

  function removeContextAttachment(item: WorkspaceContextReference): void {
    setContextAttachments((current) => contextAttachmentsWithoutItem(current, item));
  }

  return {
    addContextAttachments,
    attachComposerFiles,
    clearContextAttachments,
    removeContextAttachment,
  };
}
