import { describe, expect, it, vi } from "vitest";

import type { DesktopState } from "../../shared/desktopTypes";
import { createAppComposerProps, type AppComposerPropsInput } from "./AppComposerProps";

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
