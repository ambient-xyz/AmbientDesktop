import { describe, expect, it, vi } from "vitest";

import type { DesktopState } from "../../shared/desktopTypes";
import {
  createAppComposerProps,
  createAppComposerPropsForApp,
  type AppComposerPropsForAppInput,
  type AppComposerPropsInput,
} from "./AppComposerProps";

describe("App composer props", () => {
  it("packs grouped composer controls into the AppComposerShell prop contract", () => {
    const input = baseInput();

    const props = createAppComposerProps(input);

    expect(props.state).toBe(input.state);
    expect(props.composerInputRef).toBe(input.composerShellState.composerInputRef);
    expect(props.composerDraftStore).toBe(input.composerShellState.composerDraftStore);
    expect(props.composerCanSubmit).toBe(true);
    expect(props.selectedSlashCommand).toEqual({ kind: "app", command: "test" });
    expect(props.onSubmit).toBe(input.composerInteractionControls.submit);
    expect(props.onComposerChange).toBe(input.composerInteractionControls.handleComposerChange);
    expect(props.onSelectSymphonyPattern).toBe(input.symphonyBuilderControls.selectSymphonyPattern);
    expect(props.onToggleSymphonyBuilder).toBe(input.symphonyBuilderControls.toggleSymphonyBuilder);
    expect(props.setModelPickerOpen).toBe(input.composerModelPickerControls.setModelPickerOpen);
    expect(props.onFocusModelPickerOption).toBe(input.composerModelPickerControls.focusModelPickerOption);
    expect(props.onAbortRun).toBe(input.composerShellProps.onAbortRun);
  });

  it("packs App owner groups before delegating to the composer shell prop contract", () => {
    const input = baseForAppInput();

    const props = createAppComposerPropsForApp(input);

    expect(props.abortArmed).toBe(true);
    expect(props.canRetryContextRecovery).toBe(true);
    expect(props.localDeepResearchReady).toBe(true);
    expect(props.localDeepResearchRunActive).toBe(false);
    expect(props.localDeepResearchRunBudget).toBe(input.activeThreadModel.localDeepResearchRunBudget);
    expect(props.activeThreadSuppressesProjectBoard).toBe(true);
    expect(props.projectBoardThreadPlanAction).toBe(input.projectBoardControls.projectBoardThreadPlanAction);
    expect(props.projectBoardPlanPickerOpen).toBe(true);
    expect(props.readyPlannerPlanArtifacts).toBe(input.projectBoardControls.readyPlannerPlanArtifacts);
    expect(props.sessionContextMissing).toBe(true);
    expect(props.symphonyBuilderModel).toBe(input.subagentShellControls.symphonyBuilderModel);
    expect(props.workflowRecordingReviewFeedbackActive).toBe(true);
    expect(props.onRemoveContextAttachment).toBe(input.contextAttachmentActions.removeContextAttachment);
    expect(props.onClearContextAttachments).toBe(input.contextAttachmentActions.clearContextAttachments);
    expect(props.onCancelSttComposerRecording).toBe(input.providerRuntimeActions.cancelSttComposerRecording);
    expect(props.onDiscardSttComposerResult).toBe(input.providerRuntimeActions.discardSttComposerResult);
    expect(props.onToggleLocalDeepResearchMode).toBe(input.localDeepResearchModeControls.onToggleLocalDeepResearchMode);
    expect(props.onCreateThreadWorktree).toBe(input.gitActions.createThreadWorktreeFromFooter);
    expect(props.onCreateBranch).toBe(input.gitActions.createBranchFromFooter);
  });
});

function baseInput(): AppComposerPropsInput {
  return {
    abortArmed: false,
    activeThreadSuppressesProjectBoard: false,
    canRetryContextRecovery: true,
    composerInteractionControls: {
      chooseSymphonyPreflightCustom: vi.fn(),
      handleComposerChange: vi.fn(),
      handleComposerKeyDown: vi.fn(),
      handleComposerPaste: vi.fn(),
      removeSlashCommandSelection: vi.fn(),
      selectSlashCommandEntry: vi.fn(),
      showUnavailableSlashCommand: vi.fn(),
      submit: vi.fn(),
    } as unknown as AppComposerPropsInput["composerInteractionControls"],
    composerModelPickerControls: {
      composerModelOptions: [{ id: "model-a", label: "Model A" }],
      focusModelPickerOption: vi.fn(),
      modelPickerButtonRef: { current: null },
      modelPickerOpen: true,
      modelPickerRef: { current: null },
      selectedComposerModelOption: { id: "model-a", label: "Model A" },
      setModelPickerOpen: vi.fn(),
    } as unknown as AppComposerPropsInput["composerModelPickerControls"],
    composerShellProps: {
      onAbortRun: vi.fn(),
    } as unknown as AppComposerPropsInput["composerShellProps"],
    composerShellState: {
      composerCanSubmit: true,
      composerDraftStore: {} as AppComposerPropsInput["composerShellState"]["composerDraftStore"],
      composerInputRef: { current: null } as AppComposerPropsInput["composerShellState"]["composerInputRef"],
      selectedSlashCommand: { kind: "app", command: "test" } as AppComposerPropsInput["composerShellState"]["selectedSlashCommand"],
    },
    localDeepResearchReady: true,
    localDeepResearchRunActive: false,
    localDeepResearchRunBudget: {} as AppComposerPropsInput["localDeepResearchRunBudget"],
    onCancelSttComposerRecording: vi.fn(),
    onClearContextAttachments: vi.fn(),
    onCreateBranch: vi.fn(),
    onCreateThreadWorktree: vi.fn(),
    onDiscardSttComposerResult: vi.fn(),
    onRemoveContextAttachment: vi.fn(),
    onToggleLocalDeepResearchMode: vi.fn(),
    projectBoardPlanPickerOpen: false,
    projectBoardThreadPlanAction: undefined as unknown as AppComposerPropsInput["projectBoardThreadPlanAction"],
    providerRuntimeState: {
      sttComposer: { status: "idle" },
    } as AppComposerPropsInput["providerRuntimeState"],
    readyPlannerPlanArtifacts: [],
    running: false,
    sessionContextMissing: false,
    state: {} as DesktopState,
    symphonyBuilderControls: {
      changeSymphonyBlocking: vi.fn(),
      changeSymphonyMetric: vi.fn(),
      changeSymphonyStepCustomText: vi.fn(),
      selectSymphonyPattern: vi.fn(),
      selectSymphonyStepChoice: vi.fn(),
      submitSymphonyBuilderAction: vi.fn(),
      submitSymphonyComposerPrompt: vi.fn(),
      toggleSymphonyBuilder: vi.fn(),
    } as unknown as AppComposerPropsInput["symphonyBuilderControls"],
    symphonyBuilderModel: undefined,
    workflowRecordingReviewFeedbackActive: false,
    workflowRuntimeState: {
      chatExportBusy: false,
      chatExportStatus: undefined,
      contextAttachments: [],
      contextError: undefined,
      contextRecoveryBusy: false,
      goalBusy: false,
      goalMenuOpen: false,
      goalModeArmed: false,
      localDeepResearchModeArmed: false,
      symphonyBuilderActionBusy: undefined,
      symphonyBuilderDraft: { open: false },
    } as AppComposerPropsInput["workflowRuntimeState"],
    workspaceShellState: {
      activeGitReview: undefined,
      activeGitReviewError: undefined,
      gitStatus: undefined,
      gitStatusError: undefined,
    },
  };
}

function baseForAppInput(): AppComposerPropsForAppInput {
  const lowerInput = baseInput();
  return {
    activeThreadModel: {
      localDeepResearchReady: lowerInput.localDeepResearchReady,
      localDeepResearchRunActive: lowerInput.localDeepResearchRunActive,
      localDeepResearchRunBudget: lowerInput.localDeepResearchRunBudget,
    },
    composerInteractionControls: lowerInput.composerInteractionControls,
    composerModelPickerControls: lowerInput.composerModelPickerControls,
    composerShellProps: lowerInput.composerShellProps,
    composerShellState: lowerInput.composerShellState,
    contextAttachmentActions: {
      clearContextAttachments: lowerInput.onClearContextAttachments,
      removeContextAttachment: lowerInput.onRemoveContextAttachment,
    },
    conversationDisplayModel: {
      latestRecoveryPrompt: {
        id: "message-1",
        threadId: "thread-1",
        role: "user",
        content: "retry",
        createdAt: "2026-06-22T00:00:00.000Z",
      },
    },
    gitActions: {
      createBranchFromFooter: lowerInput.onCreateBranch,
      createThreadWorktreeFromFooter: lowerInput.onCreateThreadWorktree,
    },
    localDeepResearchModeControls: {
      onToggleLocalDeepResearchMode: lowerInput.onToggleLocalDeepResearchMode,
    },
    projectBoardControls: {
      activeThreadSuppressesProjectBoard: true,
      projectBoardPlanPickerOpen: true,
      projectBoardThreadPlanAction: lowerInput.projectBoardThreadPlanAction,
      readyPlannerPlanArtifacts: lowerInput.readyPlannerPlanArtifacts,
      sessionContextMissing: true,
    },
    providerRuntimeActions: {
      cancelSttComposerRecording: lowerInput.onCancelSttComposerRecording,
      discardSttComposerResult: lowerInput.onDiscardSttComposerResult,
    },
    providerRuntimeState: lowerInput.providerRuntimeState,
    running: lowerInput.running,
    runActivityState: {
      abortArmed: true,
    },
    state: lowerInput.state,
    subagentShellControls: {
      symphonyBuilderModel: lowerInput.symphonyBuilderModel,
    },
    symphonyBuilderControls: lowerInput.symphonyBuilderControls,
    workflowRecordingReviewControls: {
      workflowRecordingReviewFeedbackActive: true,
    },
    workflowRuntimeState: lowerInput.workflowRuntimeState,
    workspaceShellState: lowerInput.workspaceShellState,
  };
}
