import type { Dispatch, SetStateAction } from "react";

export type PromptHistoryDirection = "older" | "newer";

export type PromptHistoryNavigationState = {
  cursor?: number;
  draftBeforeHistory: string;
};

export type PromptHistoryNavigationResult = PromptHistoryNavigationState & {
  draft: string;
};

export function promptHistoryCanNavigate({
  cursor,
  direction,
  draftLength,
  historyLength,
  selectionEnd,
  selectionStart,
}: {
  cursor: number | undefined;
  direction: PromptHistoryDirection;
  draftLength: number;
  historyLength: number;
  selectionEnd: number;
  selectionStart: number;
}): boolean {
  if (historyLength === 0) return false;
  if (direction === "newer") return cursor !== undefined;
  if (cursor !== undefined) return true;
  if (draftLength > 0) return false;
  return selectionStart === 0 && selectionEnd === 0;
}

export function promptHistoryNavigation({
  cursor,
  currentDraft,
  direction,
  draftBeforeHistory,
  history,
}: {
  cursor: number | undefined;
  currentDraft: string;
  direction: PromptHistoryDirection;
  draftBeforeHistory: string;
  history: readonly string[];
}): PromptHistoryNavigationResult | undefined {
  if (history.length === 0) return undefined;
  if (direction === "older") {
    const nextCursor = cursor === undefined ? 0 : Math.min(cursor + 1, history.length - 1);
    return {
      cursor: nextCursor,
      draft: history[nextCursor] ?? "",
      draftBeforeHistory: cursor === undefined ? currentDraft : draftBeforeHistory,
    };
  }

  if (cursor === undefined) return undefined;
  if (cursor === 0) {
    return {
      cursor: undefined,
      draft: draftBeforeHistory,
      draftBeforeHistory: "",
    };
  }

  const nextCursor = cursor - 1;
  return {
    cursor: nextCursor,
    draft: history[nextCursor] ?? "",
    draftBeforeHistory,
  };
}

export function createAppPromptHistoryControls({
  clearSttDraftMetadata,
  draftBeforePromptHistory,
  getComposerDraft,
  getPromptHistory,
  promptHistoryCursor,
  setComposerDraft,
  setDraftBeforePromptHistory,
  setPromptHistoryCursor,
}: {
  clearSttDraftMetadata: () => void;
  draftBeforePromptHistory: string;
  getComposerDraft: () => string;
  getPromptHistory: () => readonly string[];
  promptHistoryCursor: number | undefined;
  setComposerDraft: (value: string, options?: { focusEnd?: boolean }) => void;
  setDraftBeforePromptHistory: Dispatch<SetStateAction<string>>;
  setPromptHistoryCursor: Dispatch<SetStateAction<number | undefined>>;
}): {
  navigatePromptHistory: (direction: PromptHistoryDirection) => void;
  resetPromptHistory: () => void;
  shouldNavigatePromptHistory: (textarea: HTMLTextAreaElement, direction: PromptHistoryDirection) => boolean;
} {
  function setDraftFromPromptHistory(value: string): void {
    setComposerDraft(value, { focusEnd: true });
    clearSttDraftMetadata();
  }

  function resetPromptHistory(): void {
    setPromptHistoryCursor(undefined);
    setDraftBeforePromptHistory("");
  }

  return {
    navigatePromptHistory(direction) {
      const next = promptHistoryNavigation({
        cursor: promptHistoryCursor,
        currentDraft: getComposerDraft(),
        direction,
        draftBeforeHistory: draftBeforePromptHistory,
        history: getPromptHistory(),
      });
      if (!next) return;
      setPromptHistoryCursor(next.cursor);
      setDraftBeforePromptHistory(next.draftBeforeHistory);
      setDraftFromPromptHistory(next.draft);
    },
    resetPromptHistory,
    shouldNavigatePromptHistory(textarea, direction) {
      return promptHistoryCanNavigate({
        cursor: promptHistoryCursor,
        direction,
        draftLength: getComposerDraft().length,
        historyLength: getPromptHistory().length,
        selectionEnd: textarea.selectionEnd,
        selectionStart: textarea.selectionStart,
      });
    },
  };
}
