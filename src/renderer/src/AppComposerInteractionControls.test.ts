import type {
  ClipboardEvent as ReactClipboardEvent,
  Dispatch,
  FormEvent,
  KeyboardEvent as ReactKeyboardEvent,
  SetStateAction,
} from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { DesktopState } from "../../shared/desktopTypes";
import type { SlashCommandCatalogEntry, SlashCommandSelection } from "../../shared/slashCommandTypes";
import type { ChatMessage } from "../../shared/threadTypes";
import type { PendingWorkflowRecordingEditContext } from "./AppComposerSubmitActions";
import type { AppComposerDraftSetOptions } from "./AppComposerShellState";
import {
  createAppLocalDeepResearchModeControls,
  createAppComposerInteractionControls,
  createAppPendingSubmittedPromptControls,
  PENDING_SUBMITTED_PROMPT_MAX_AGE_MS,
  pendingSubmittedPromptsAfterCleanup,
  pastedComposerDraft,
} from "./AppComposerInteractionControls";
import type { PendingSubmittedPrompt } from "./AppConversationDisplayModel";
import type { SymphonyWorkflowBuilderDraft } from "./symphonyWorkflowBuilderUiModel";
import type { SttDraftMetadataState } from "./sttUiModel";

type LocalDeepResearchBudgetOverride =
  Parameters<Parameters<typeof createAppLocalDeepResearchModeControls>[0]["setLocalDeepResearchBudgetOverride"]>[0] extends SetStateAction<
    infer Value
  >
    ? Value
    : never;

describe("App composer interaction controls", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("models pasted composer text and cursor placement", () => {
    expect(
      pastedComposerDraft({
        currentDraft: "hello world",
        start: 6,
        end: 11,
        text: "Ambient",
      }),
    ).toEqual({
      cursor: 13,
      value: "hello Ambient",
    });
  });

  it("selects slash commands while preserving the draft/ref composer path", () => {
    const controller = createController({ localDeepResearchModeArmed: true });
    const entry = slashCommandEntry();

    controller.actions.selectSlashCommandEntry(entry, "/rev", "/rev migrate");

    expect(controller.slashCommandSelection.value).toEqual(
      expect.objectContaining({
        entryId: "codex-plugin-skill:reviewer",
        command: "/reviewer",
        title: "reviewer",
      }),
    );
    expect(controller.draft.value).toBe("migrate");
    expect(controller.lastDraftOptions).toEqual({ focusEnd: true });
    expect(controller.localDeepResearchModeArmedRef.current).toBe(false);
    expect(controller.contextError.value).toBeUndefined();
  });

  it("keeps app slash commands as draft rewrites instead of selected command state", () => {
    const controller = createController({ localDeepResearchModeArmed: true });

    controller.actions.selectSlashCommandEntry(
      {
        ...slashCommandEntry(),
        kind: "app",
        command: "/plan",
        title: "Plan Mode",
      },
      "/pl",
      "/pl refactor this",
    );

    expect(controller.slashCommandSelection.value).toBeUndefined();
    expect(controller.draft.value).toBe("/plan refactor this");
    expect(controller.localDeepResearchModeArmedRef.current).toBe(true);
  });

  it("registers and removes pending submitted prompt previews", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-21T12:00:00.000Z"));
    vi.spyOn(Math, "random").mockReturnValue(0.5);
    const prompts = statefulSetter<PendingSubmittedPrompt[]>([]);
    const controls = createAppPendingSubmittedPromptControls({
      state: desktopState(),
      setPendingSubmittedPrompts: prompts.set,
    });

    const id = controls.registerPendingSubmittedPrompt({
      threadId: "thread-1",
      content: "Run the migration",
      delivery: "prompt",
    });

    expect(id).toMatch(/^pending-submitted-\d+-i$/);
    expect(prompts.value).toEqual([
      {
        id,
        threadId: "thread-1",
        content: "Run the migration",
        delivery: "prompt",
        createdAt: "2026-06-21T12:00:00.000Z",
        afterMessageId: "message-1",
      },
    ]);

    controls.removePendingSubmittedPrompt(id);

    expect(prompts.value).toEqual([]);
  });

  it("prunes expired and persisted pending submitted prompt previews", () => {
    const current = [
      pendingPrompt({ id: "expired", createdAt: "2026-06-21T11:54:59.000Z" }),
      pendingPrompt({ id: "persisted", content: "Persisted prompt" }),
      pendingPrompt({ id: "other-thread", threadId: "thread-2", content: "Persisted prompt" }),
      pendingPrompt({ id: "waiting", content: "Still waiting" }),
    ];
    const messages = [chatMessage({ id: "user-2", content: "Persisted prompt", createdAt: "2026-06-21T11:59:30.000Z" })];

    expect(
      pendingSubmittedPromptsAfterCleanup({
        activeThreadId: "thread-1",
        messages,
        now: Date.parse("2026-06-21T12:00:00.000Z"),
        pendingSubmittedPrompts: current,
        running: false,
      }).map((prompt) => prompt.id),
    ).toEqual(["other-thread", "waiting"]);

    const unchanged = [
      pendingPrompt({
        id: "fresh",
        createdAt: new Date(Date.parse("2026-06-21T12:00:00.000Z") - PENDING_SUBMITTED_PROMPT_MAX_AGE_MS).toISOString(),
      }),
    ];
    expect(
      pendingSubmittedPromptsAfterCleanup({
        activeThreadId: "thread-1",
        messages: [],
        now: Date.parse("2026-06-21T12:00:00.000Z"),
        pendingSubmittedPrompts: unchanged,
        running: true,
      }),
    ).toBe(unchanged);
  });

  it("toggles Local Deep Research mode while keeping composer mode exclusions intact", () => {
    const localDeepResearchModeArmedRef = { current: false };
    const contextError = statefulSetter<string | undefined>("previous error");
    const goalModeArmed = statefulSetter(true);
    const localDeepResearchBudgetOverride = statefulSetter<LocalDeepResearchBudgetOverride>({ effort: "deep" });
    const localDeepResearchModeArmed = statefulSetter(false);
    const symphonyBuilderDraft = statefulSetter<SymphonyWorkflowBuilderDraft>({ open: true });
    const focusComposerEnd = vi.fn();
    const controls = createAppLocalDeepResearchModeControls({
      focusComposerEnd,
      localDeepResearchModeArmedRef,
      localDeepResearchReady: true,
      setContextError: contextError.set,
      setGoalModeArmed: goalModeArmed.set,
      setLocalDeepResearchBudgetOverride: localDeepResearchBudgetOverride.set,
      setLocalDeepResearchModeArmedState: localDeepResearchModeArmed.set,
      setSymphonyBuilderDraft: symphonyBuilderDraft.set,
      state: desktopState(),
    });

    controls.toggleLocalDeepResearchMode();

    expect(localDeepResearchModeArmedRef.current).toBe(true);
    expect(localDeepResearchModeArmed.value).toBe(true);
    expect(contextError.value).toBeUndefined();
    expect(goalModeArmed.value).toBe(false);
    expect(symphonyBuilderDraft.value.open).toBe(false);
    expect(focusComposerEnd).toHaveBeenCalledOnce();

    controls.setLocalDeepResearchModeArmed(false);

    expect(localDeepResearchModeArmedRef.current).toBe(false);
    expect(localDeepResearchModeArmed.value).toBe(false);
    expect(localDeepResearchBudgetOverride.value).toBeUndefined();
  });

  it("does not toggle Local Deep Research mode when unavailable or planner-owned", () => {
    const localDeepResearchModeArmedRef = { current: false };
    const localDeepResearchModeArmed = statefulSetter(false);
    const focusComposerEnd = vi.fn();
    const controls = createAppLocalDeepResearchModeControls({
      focusComposerEnd,
      localDeepResearchModeArmedRef,
      localDeepResearchReady: false,
      setContextError: vi.fn(),
      setGoalModeArmed: vi.fn(),
      setLocalDeepResearchBudgetOverride: vi.fn(),
      setLocalDeepResearchModeArmedState: localDeepResearchModeArmed.set,
      setSymphonyBuilderDraft: vi.fn(),
      state: desktopState(),
    });

    controls.toggleLocalDeepResearchMode();

    expect(localDeepResearchModeArmedRef.current).toBe(false);
    expect(localDeepResearchModeArmed.value).toBe(false);
    expect(focusComposerEnd).not.toHaveBeenCalled();

    const plannerControls = createAppLocalDeepResearchModeControls({
      focusComposerEnd,
      localDeepResearchModeArmedRef,
      localDeepResearchReady: true,
      setContextError: vi.fn(),
      setGoalModeArmed: vi.fn(),
      setLocalDeepResearchBudgetOverride: vi.fn(),
      setLocalDeepResearchModeArmedState: localDeepResearchModeArmed.set,
      setSymphonyBuilderDraft: vi.fn(),
      state: desktopState({ collaborationMode: "planner" }),
    });

    plannerControls.toggleLocalDeepResearchMode();

    expect(localDeepResearchModeArmedRef.current).toBe(false);
    expect(focusComposerEnd).not.toHaveBeenCalled();
  });

  it("routes submit through Symphony only when the existing preflight allows it", () => {
    const controller = createController({
      draft: "build the feature",
      subagentUiEnabled: true,
      symphonyBuilderOpen: true,
    });
    const event = formEvent();

    controller.actions.submit(event);

    expect(event.preventDefault).toHaveBeenCalledOnce();
    expect(controller.submitSymphonyComposerPrompt).toHaveBeenCalledWith();
    expect(controller.submitComposerDraft).not.toHaveBeenCalled();
  });

  it("falls back to normal prompt submit when Symphony routing is unavailable", () => {
    const controller = createController({
      draft: "build the feature",
      subagentUiEnabled: false,
      symphonyBuilderOpen: true,
    });

    controller.actions.submit(formEvent());

    expect(controller.submitComposerDraft).toHaveBeenCalledWith("prompt");
    expect(controller.submitSymphonyComposerPrompt).not.toHaveBeenCalled();
  });

  it("handles prompt history keys and Enter submission modifiers", () => {
    const controller = createController({
      shouldNavigatePromptHistory: vi.fn(() => true),
    });
    const arrowEvent = keyboardEvent({ key: "ArrowUp" });

    controller.actions.handleComposerKeyDown(arrowEvent);

    expect(arrowEvent.preventDefault).toHaveBeenCalledOnce();
    expect(controller.navigatePromptHistory).toHaveBeenCalledWith("older");

    const enterEvent = keyboardEvent({ key: "Enter", altKey: true });
    controller.actions.handleComposerKeyDown(enterEvent);

    expect(enterEvent.preventDefault).toHaveBeenCalledOnce();
    expect(controller.submitComposerDraft).toHaveBeenCalledWith("prompt", true);
  });

  it("clears workflow-edit and STT draft metadata when the composer diverges", () => {
    const pending = workflowEditContext();
    const sttDraftMetadata = sttDraft();
    const controller = createController({
      pendingWorkflowRecordingEditContext: pending,
      sttDraftMetadata,
    });

    controller.actions.handleComposerChange("Different prompt");

    expect(controller.pendingWorkflowRecordingEditContext.value).toBeUndefined();
    expect(controller.sttDraftMetadata.value).toBeUndefined();
    expect(controller.resetPromptHistory).toHaveBeenCalledOnce();
  });

  it("handles pasted text through the existing draft setter and change path", () => {
    const requestAnimationFrame = vi.fn((callback: FrameRequestCallback) => {
      callback(0);
      return 1;
    });
    vi.stubGlobal("window", { requestAnimationFrame });
    const controller = createController({ draft: "hello world" });
    const textarea = textareaElement("hello world", 6, 11);
    const event = pasteEvent(textarea, "Ambient");

    controller.actions.handleComposerPaste(event);

    expect(event.preventDefault).toHaveBeenCalledOnce();
    expect(controller.draft.value).toBe("hello Ambient");
    expect(controller.updateComposerDraftValue).toHaveBeenCalledWith("hello Ambient");
    expect(textarea.selectionStart).toBe(13);
    expect(textarea.selectionEnd).toBe(13);
  });
});

function createController({
  draft = "",
  localDeepResearchModeArmed = false,
  pendingWorkflowRecordingEditContext = undefined,
  shouldNavigatePromptHistory = vi.fn(() => false),
  state = desktopState(),
  sttDraftMetadata = undefined,
  subagentUiEnabled = false,
  symphonyBuilderOpen = false,
}: {
  draft?: string;
  localDeepResearchModeArmed?: boolean;
  pendingWorkflowRecordingEditContext?: PendingWorkflowRecordingEditContext;
  shouldNavigatePromptHistory?: (textarea: HTMLTextAreaElement, direction: "older" | "newer") => boolean;
  state?: DesktopState | undefined;
  sttDraftMetadata?: SttDraftMetadataState;
  subagentUiEnabled?: boolean;
  symphonyBuilderOpen?: boolean;
} = {}) {
  const draftState = { value: draft };
  const contextError = statefulSetter<string | undefined>(undefined);
  const pendingWorkflowRecordingEditContextState = statefulSetter<PendingWorkflowRecordingEditContext | undefined>(
    pendingWorkflowRecordingEditContext,
  );
  const slashCommandSelectionState = statefulSetter<SlashCommandSelection | undefined>(undefined);
  const sttDraftMetadataState = statefulSetter<SttDraftMetadataState | undefined>(sttDraftMetadata);
  const localDeepResearchModeArmedRef = { current: localDeepResearchModeArmed };
  const draftOptions: { value: AppComposerDraftSetOptions | undefined } = { value: undefined };
  const navigatePromptHistory = vi.fn();
  const resetPromptHistory = vi.fn();
  const submitComposerDraft = vi.fn(async () => undefined);
  const submitSymphonyComposerPrompt = vi.fn(async () => undefined);
  const updateComposerDraftValue = vi.fn((value: string) => {
    draftState.value = value;
  });

  return {
    actions: createAppComposerInteractionControls({
      focusComposerEnd: vi.fn(),
      getComposerDraft: () => draftState.value,
      goalModeArmed: false,
      localDeepResearchModeArmedRef,
      navigatePromptHistory,
      pendingWorkflowRecordingEditContext,
      resetPromptHistory,
      running: false,
      selectedSlashCommandRef: { current: slashCommandSelectionState.value },
      setComposerDraft: (value, options) => {
        draftState.value = value;
        draftOptions.value = options;
      },
      setContextError: contextError.set,
      setLocalDeepResearchModeArmed: (next) => {
        localDeepResearchModeArmedRef.current = next;
      },
      setPendingWorkflowRecordingEditContext: pendingWorkflowRecordingEditContextState.set,
      setSelectedSlashCommand: slashCommandSelectionState.set,
      setSttDraftMetadata: sttDraftMetadataState.set,
      shouldNavigatePromptHistory,
      state,
      sttDraftMetadata,
      subagentUiEnabled,
      submitComposerDraft,
      submitSymphonyComposerPrompt,
      symphonyBuilderOpen,
      updateComposerDraftValue,
      workflowRecordingReviewFeedbackActive: false,
    }),
    contextError,
    draft: draftState,
    get lastDraftOptions() {
      return draftOptions.value;
    },
    localDeepResearchModeArmedRef,
    navigatePromptHistory,
    pendingWorkflowRecordingEditContext: pendingWorkflowRecordingEditContextState,
    resetPromptHistory,
    shouldNavigatePromptHistory,
    slashCommandSelection: slashCommandSelectionState,
    sttDraftMetadata: sttDraftMetadataState,
    submitComposerDraft,
    submitSymphonyComposerPrompt,
    updateComposerDraftValue,
  };
}

function statefulSetter<T>(initial: T): {
  set: Dispatch<SetStateAction<T>>;
  value: T;
} {
  const state = { value: initial };
  return {
    get value() {
      return state.value;
    },
    set(next) {
      state.value = typeof next === "function" ? (next as (current: T) => T)(state.value) : next;
    },
  };
}

function desktopState(settings: Partial<DesktopState["settings"]> = {}): DesktopState {
  return {
    activeThreadId: "thread-1",
    messages: [{ id: "message-1" }],
    settings: {
      collaborationMode: "agent",
      ...settings,
    },
  } as DesktopState;
}

function pendingPrompt(overrides: Partial<PendingSubmittedPrompt>): PendingSubmittedPrompt {
  return {
    id: overrides.id ?? "pending",
    threadId: overrides.threadId ?? "thread-1",
    content: overrides.content ?? "Run the migration",
    delivery: overrides.delivery ?? "prompt",
    createdAt: overrides.createdAt ?? "2026-06-21T11:59:00.000Z",
    afterMessageId: overrides.afterMessageId,
  };
}

function chatMessage(overrides: Partial<ChatMessage>): ChatMessage {
  return {
    id: overrides.id ?? "message",
    threadId: overrides.threadId ?? "thread-1",
    role: overrides.role ?? "user",
    content: overrides.content ?? "Prompt",
    createdAt: overrides.createdAt ?? "2026-06-21T12:00:00.000Z",
    metadata: overrides.metadata,
  };
}

function slashCommandEntry(): SlashCommandCatalogEntry {
  return {
    id: "codex-plugin-skill:reviewer",
    command: "/reviewer",
    title: "reviewer",
    kind: "skill",
    sourceKind: "codex-plugin",
    invocationKind: "codex-plugin-skill",
    sourceId: "plugin-reviewer",
    sourceName: "reviewer",
    sourceVersion: "1.0.0",
    sourceFingerprint: "abc123",
    requiresParameters: false,
    availability: "available",
    badges: ["Skill"],
    icon: "sparkles",
    searchText: "reviewer",
  } as SlashCommandCatalogEntry;
}

function workflowEditContext(): PendingWorkflowRecordingEditContext {
  return {
    draftPrefix: "Edit:",
    recordingId: "recording-1",
    playbookId: "playbook-1",
    stepId: "step-1",
  } as unknown as PendingWorkflowRecordingEditContext;
}

function sttDraft(): SttDraftMetadataState {
  return {
    content: "Original transcript",
    metadata: {
      utteranceId: "utterance-1",
      status: "ready",
    },
  } as unknown as SttDraftMetadataState;
}

function formEvent(): FormEvent {
  return {
    preventDefault: vi.fn(),
  } as unknown as FormEvent;
}

function keyboardEvent(input: { altKey?: boolean; ctrlKey?: boolean; key: string; metaKey?: boolean; shiftKey?: boolean }) {
  return {
    altKey: Boolean(input.altKey),
    ctrlKey: Boolean(input.ctrlKey),
    currentTarget: textareaElement("draft", 0, 0),
    key: input.key,
    metaKey: Boolean(input.metaKey),
    preventDefault: vi.fn(),
    shiftKey: Boolean(input.shiftKey),
  } as unknown as ReactKeyboardEvent<HTMLTextAreaElement>;
}

function pasteEvent(textarea: HTMLTextAreaElement, text: string) {
  return {
    clipboardData: {
      getData: vi.fn(() => text),
    },
    currentTarget: textarea,
    preventDefault: vi.fn(),
  } as unknown as ReactClipboardEvent<HTMLTextAreaElement>;
}

function textareaElement(value: string, selectionStart: number, selectionEnd: number): HTMLTextAreaElement {
  return {
    focus: vi.fn(),
    selectionEnd,
    selectionStart,
    value,
  } as unknown as HTMLTextAreaElement;
}
