import type {
  ClipboardEvent as ReactClipboardEvent,
  Dispatch,
  FormEvent,
  KeyboardEvent as ReactKeyboardEvent,
  MutableRefObject,
  SetStateAction,
} from "react";
import { useEffect } from "react";

import type { DesktopState } from "../../shared/desktopTypes";
import type { LocalDeepResearchRunBudget } from "../../shared/localRuntimeTypes";
import type { SlashCommandCatalogEntry, SlashCommandSelection } from "../../shared/slashCommandTypes";
import type { ChatMessage, MessageDelivery } from "../../shared/threadTypes";
import type { PendingWorkflowRecordingEditContext } from "./AppComposerSubmitActions";
import type { AppComposerDraftSetOptions } from "./AppComposerShellState";
import { pendingSubmittedPromptHasPersistedMatch, type PendingSubmittedPrompt } from "./AppConversationDisplayModel";
import { shouldRouteComposerSubmitThroughSymphony } from "./AppSymphonyBuilderControls";
import { slashCommandDraftAfterSelection, type SlashCommandDraftTrigger, slashCommandSelectionFromEntry } from "./slashCommandUiModel";
import type { SymphonyWorkflowBuilderDraft } from "./symphonyWorkflowBuilderUiModel";
import type { SttDraftMetadataState } from "./sttUiModel";

export type AppComposerInteractionControls = {
  chooseSymphonyPreflightCustom: (goal: string) => void;
  handleComposerChange: (value: string) => void;
  handleComposerKeyDown: (event: ReactKeyboardEvent<HTMLTextAreaElement>) => void;
  handleComposerPaste: (event: ReactClipboardEvent<HTMLTextAreaElement>) => void;
  removeSlashCommandSelection: () => void;
  selectSlashCommandEntry: (entry: SlashCommandCatalogEntry, query: string, draft: string, trigger?: SlashCommandDraftTrigger) => void;
  showUnavailableSlashCommand: (entry: SlashCommandCatalogEntry) => void;
  submit: (event: FormEvent) => void;
};

export type AppPendingSubmittedPromptControls = {
  registerPendingSubmittedPrompt: (input: { threadId: string; content: string; delivery: MessageDelivery }) => string | undefined;
  removePendingSubmittedPrompt: (id: string | undefined) => void;
};

type LocalDeepResearchBudgetOverride = Partial<Pick<LocalDeepResearchRunBudget, "effort" | "maxToolCalls" | "onExhausted">> | undefined;

export type AppLocalDeepResearchModeControls = {
  setLocalDeepResearchModeArmed: (next: boolean) => void;
  toggleLocalDeepResearchMode: () => void;
};

export const PENDING_SUBMITTED_PROMPT_MAX_AGE_MS = 5 * 60 * 1000;

export function pastedComposerDraft(input: { currentDraft: string; end: number | undefined; start: number | undefined; text: string }): {
  cursor: number;
  value: string;
} {
  const start = input.start ?? input.currentDraft.length;
  const end = input.end ?? input.currentDraft.length;
  return {
    cursor: start + input.text.length,
    value: `${input.currentDraft.slice(0, start)}${input.text}${input.currentDraft.slice(end)}`,
  };
}

export function createAppComposerInteractionControls({
  focusComposerEnd,
  getComposerDraft,
  goalModeArmed,
  localDeepResearchModeArmedRef,
  pendingWorkflowRecordingEditContext,
  running,
  navigatePromptHistory,
  resetPromptHistory,
  selectedSlashCommandRef,
  setComposerDraft,
  setContextError,
  setLocalDeepResearchModeArmed,
  setPendingWorkflowRecordingEditContext,
  setSelectedSlashCommand,
  setSttDraftMetadata,
  shouldNavigatePromptHistory,
  state,
  sttDraftMetadata,
  subagentUiEnabled,
  submitComposerDraft,
  submitSymphonyComposerPrompt,
  symphonyBuilderOpen,
  updateComposerDraftValue,
  workflowRecordingReviewFeedbackActive,
}: {
  focusComposerEnd: () => void;
  getComposerDraft: () => string;
  goalModeArmed: boolean;
  localDeepResearchModeArmedRef: MutableRefObject<boolean>;
  pendingWorkflowRecordingEditContext: PendingWorkflowRecordingEditContext | undefined;
  running: boolean;
  navigatePromptHistory: (direction: "older" | "newer") => void;
  resetPromptHistory: () => void;
  selectedSlashCommandRef: MutableRefObject<SlashCommandSelection | undefined>;
  setComposerDraft: (value: string, options?: AppComposerDraftSetOptions) => void;
  setContextError: Dispatch<SetStateAction<string | undefined>>;
  setLocalDeepResearchModeArmed: (next: boolean) => void;
  setPendingWorkflowRecordingEditContext: Dispatch<SetStateAction<PendingWorkflowRecordingEditContext | undefined>>;
  setSelectedSlashCommand: (selection: SlashCommandSelection | undefined) => void;
  setSttDraftMetadata: Dispatch<SetStateAction<SttDraftMetadataState | undefined>>;
  shouldNavigatePromptHistory: (textarea: HTMLTextAreaElement, direction: "older" | "newer") => boolean;
  state: DesktopState | undefined;
  sttDraftMetadata: SttDraftMetadataState | undefined;
  subagentUiEnabled: boolean;
  submitComposerDraft: (requestedDelivery: MessageDelivery, followUpModifier?: boolean) => Promise<void>;
  submitSymphonyComposerPrompt: (followUpModifier?: boolean) => Promise<unknown>;
  symphonyBuilderOpen: boolean | undefined;
  updateComposerDraftValue: (value: string) => void;
  workflowRecordingReviewFeedbackActive: boolean;
}): AppComposerInteractionControls {
  function shouldSubmitThroughSymphony(): boolean {
    if (!state) return false;
    return shouldRouteComposerSubmitThroughSymphony({
      subagentUiEnabled,
      symphonyBuilderOpen,
      localDeepResearchModeArmed: localDeepResearchModeArmedRef.current,
      slashCommandSelected: Boolean(selectedSlashCommandRef.current),
      running,
      goalModeArmed,
      workflowRecordingReviewFeedbackActive,
      workflowRecordingEditActive: Boolean(pendingWorkflowRecordingEditContext),
      composerDraft: getComposerDraft(),
      collaborationMode: state.settings.collaborationMode,
    });
  }

  function chooseSymphonyPreflightCustom(goal: string): void {
    const trimmedGoal = goal.trim();
    const customDraft = trimmedGoal ? `${trimmedGoal}\n\nCustom Symphony pattern: ` : "Custom Symphony pattern: ";
    setComposerDraft(customDraft, { focusEnd: true, clearSlashCommandSelection: true });
    setContextError("Add enough custom orchestration detail for Symphony to choose one of the six execution patterns, then send again.");
  }

  function selectSlashCommandEntry(entry: SlashCommandCatalogEntry, query: string, draft: string, trigger?: SlashCommandDraftTrigger): void {
    if (entry.kind === "app") {
      setSelectedSlashCommand(undefined);
      setComposerDraft(slashCommandDraftAfterSelection(draft, entry, trigger), { focusEnd: true });
      return;
    }
    setSelectedSlashCommand(slashCommandSelectionFromEntry(entry, query));
    setComposerDraft(slashCommandDraftAfterSelection(draft, entry, trigger), { focusEnd: true });
    if (localDeepResearchModeArmedRef.current) setLocalDeepResearchModeArmed(false);
    setContextError(undefined);
  }

  function removeSlashCommandSelection(): void {
    setSelectedSlashCommand(undefined);
    focusComposerEnd();
  }

  function showUnavailableSlashCommand(entry: SlashCommandCatalogEntry): void {
    setContextError(entry.availabilityReason ?? `${entry.title} is ${entry.availability}.`);
  }

  function submit(event: FormEvent): void {
    event.preventDefault();
    if (shouldSubmitThroughSymphony()) {
      void submitSymphonyComposerPrompt();
      return;
    }
    void submitComposerDraft("prompt");
  }

  function handleComposerChange(value: string): void {
    updateComposerDraftValue(value);
    if (pendingWorkflowRecordingEditContext && !value.startsWith(pendingWorkflowRecordingEditContext.draftPrefix)) {
      setPendingWorkflowRecordingEditContext(undefined);
    }
    if (sttDraftMetadata && value.trim() !== sttDraftMetadata.content.trim()) setSttDraftMetadata(undefined);
    resetPromptHistory();
  }

  function handleComposerPaste(event: ReactClipboardEvent<HTMLTextAreaElement>): void {
    const text = event.clipboardData.getData("text");
    if (!text) return;
    event.preventDefault();
    const textarea = event.currentTarget;
    const { cursor, value } = pastedComposerDraft({
      currentDraft: textarea.value,
      start: textarea.selectionStart,
      end: textarea.selectionEnd,
      text,
    });
    setComposerDraft(value);
    handleComposerChange(value);
    window.requestAnimationFrame(() => {
      textarea.focus();
      textarea.selectionStart = cursor;
      textarea.selectionEnd = cursor;
    });
  }

  function handleComposerKeyDown(event: ReactKeyboardEvent<HTMLTextAreaElement>): void {
    const plainArrow = !event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey;
    if (plainArrow && event.key === "ArrowUp" && shouldNavigatePromptHistory(event.currentTarget, "older")) {
      event.preventDefault();
      navigatePromptHistory("older");
      return;
    }
    if (plainArrow && event.key === "ArrowDown" && shouldNavigatePromptHistory(event.currentTarget, "newer")) {
      event.preventDefault();
      navigatePromptHistory("newer");
      return;
    }
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      if (shouldSubmitThroughSymphony()) {
        void submitSymphonyComposerPrompt(event.altKey);
        return;
      }
      void submitComposerDraft("prompt", event.altKey);
    }
  }

  return {
    chooseSymphonyPreflightCustom,
    handleComposerChange,
    handleComposerKeyDown,
    handleComposerPaste,
    removeSlashCommandSelection,
    selectSlashCommandEntry,
    showUnavailableSlashCommand,
    submit,
  };
}

export function createAppPendingSubmittedPromptControls({
  state,
  setPendingSubmittedPrompts,
}: {
  state: DesktopState | undefined;
  setPendingSubmittedPrompts: Dispatch<SetStateAction<PendingSubmittedPrompt[]>>;
}): AppPendingSubmittedPromptControls {
  function registerPendingSubmittedPrompt(input: { threadId: string; content: string; delivery: MessageDelivery }): string | undefined {
    if (!input.content.trim()) return undefined;
    const id = `pending-submitted-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const prompt: PendingSubmittedPrompt = {
      id,
      threadId: input.threadId,
      content: input.content,
      delivery: input.delivery,
      createdAt: new Date().toISOString(),
      ...(state?.activeThreadId === input.threadId && state.messages.length > 0
        ? { afterMessageId: state.messages[state.messages.length - 1]?.id }
        : {}),
    };
    setPendingSubmittedPrompts((current) => [...current, prompt].slice(-10));
    return id;
  }

  function removePendingSubmittedPrompt(id: string | undefined): void {
    if (!id) return;
    setPendingSubmittedPrompts((current) => current.filter((prompt) => prompt.id !== id));
  }

  return {
    registerPendingSubmittedPrompt,
    removePendingSubmittedPrompt,
  };
}

export function pendingSubmittedPromptsAfterCleanup({
  activeThreadId,
  messages,
  now,
  pendingSubmittedPrompts,
  running,
}: {
  activeThreadId: string;
  messages: ChatMessage[];
  now: number;
  pendingSubmittedPrompts: PendingSubmittedPrompt[];
  running: boolean;
}): PendingSubmittedPrompt[] {
  const next = pendingSubmittedPrompts.filter((prompt) => {
    const createdAt = Date.parse(prompt.createdAt);
    if (Number.isFinite(createdAt) && now - createdAt > PENDING_SUBMITTED_PROMPT_MAX_AGE_MS) return false;
    if (prompt.threadId !== activeThreadId) return true;
    if (!running && pendingSubmittedPromptHasPersistedMatch(prompt, messages)) return false;
    return true;
  });
  return next.length === pendingSubmittedPrompts.length ? pendingSubmittedPrompts : next;
}

export function useAppPendingSubmittedPromptCleanup({
  now = Date.now,
  pendingSubmittedPrompts,
  running,
  setPendingSubmittedPrompts,
  state,
}: {
  now?: () => number;
  pendingSubmittedPrompts: PendingSubmittedPrompt[];
  running: boolean;
  setPendingSubmittedPrompts: Dispatch<SetStateAction<PendingSubmittedPrompt[]>>;
  state: DesktopState | undefined;
}): void {
  useEffect(() => {
    if (!state) return;
    if (pendingSubmittedPrompts.length === 0) return;
    const currentNow = now();
    const next = pendingSubmittedPromptsAfterCleanup({
      activeThreadId: state.activeThreadId,
      messages: state.messages,
      now: currentNow,
      pendingSubmittedPrompts,
      running,
    });
    if (next !== pendingSubmittedPrompts) setPendingSubmittedPrompts(next);
  }, [now, pendingSubmittedPrompts, running, setPendingSubmittedPrompts, state?.activeThreadId, state?.messages]);
}

export function createAppLocalDeepResearchModeControls({
  focusComposerEnd,
  localDeepResearchModeArmedRef,
  localDeepResearchReady,
  setContextError,
  setGoalModeArmed,
  setLocalDeepResearchBudgetOverride,
  setLocalDeepResearchModeArmedState,
  setSymphonyBuilderDraft,
  state,
}: {
  focusComposerEnd: () => void;
  localDeepResearchModeArmedRef: MutableRefObject<boolean>;
  localDeepResearchReady: boolean;
  setContextError: Dispatch<SetStateAction<string | undefined>>;
  setGoalModeArmed: Dispatch<SetStateAction<boolean>>;
  setLocalDeepResearchBudgetOverride: Dispatch<SetStateAction<LocalDeepResearchBudgetOverride>>;
  setLocalDeepResearchModeArmedState: Dispatch<SetStateAction<boolean>>;
  setSymphonyBuilderDraft: Dispatch<SetStateAction<SymphonyWorkflowBuilderDraft>>;
  state: DesktopState | undefined;
}): AppLocalDeepResearchModeControls {
  function setLocalDeepResearchModeArmed(next: boolean): void {
    localDeepResearchModeArmedRef.current = next;
    if (!next) setLocalDeepResearchBudgetOverride(undefined);
    setLocalDeepResearchModeArmedState(next);
  }

  function toggleLocalDeepResearchMode(): void {
    if (!state || !localDeepResearchReady || state.settings.collaborationMode === "planner") {
      return;
    }
    setContextError(undefined);
    const next = !localDeepResearchModeArmedRef.current;
    setLocalDeepResearchModeArmed(next);
    if (next) {
      setGoalModeArmed(false);
      setSymphonyBuilderDraft((current) => (current.open ? { ...current, open: false } : current));
    }
    focusComposerEnd();
  }

  return {
    setLocalDeepResearchModeArmed,
    toggleLocalDeepResearchMode,
  };
}
