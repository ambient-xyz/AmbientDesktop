import type { Dispatch, SetStateAction } from "react";

import type { DesktopState } from "../../shared/desktopTypes";
import type { LocalDeepResearchSetupAction } from "../../shared/localRuntimeTypes";
import type { PermissionMode, PermissionPromptResponseMode } from "../../shared/permissionTypes";
import type { AppModalHostProps, SubagentApprovalDecisionDialogState, SubagentBarrierDecisionDialogState } from "./AppModalHost";
import type { AmbientCliSecretDialogState, CommandPaletteItem } from "./AppDialogs";
import type {
  PlannerRevisionDialogState,
  ProjectActionDialogState,
  ProjectBoardResetDialogState,
  ThreadActionDialogState,
} from "./AppActionDialogs";
import type { MediaPreviewModalRequest } from "./AppToolMessages";
import type { useAppProjectShellState } from "./AppProjectShellState";
import type { useAppProviderRuntimeState } from "./AppProviderRuntimeState";
import type { useAppSecurityPromptState } from "./AppSecurityPromptState";
import type { useAppShellUiState } from "./AppShellUiState";
import type { useAppWorkflowRuntimeState } from "./AppWorkflowRuntimeState";
import type { useAppWorkspaceShellState } from "./AppWorkspaceShellState";
import type { GitConfirmation } from "./RightPanel";

type MaybeAsyncUnknown = unknown | Promise<unknown>;

type AdaptedModalHostPropKey =
  | "generatedMediaAutoplay"
  | "provider"
  | "permissionMode"
  | "onCloseMediaPreview"
  | "onOpenMediaPreviewInFiles"
  | "onCloseApiKey"
  | "onOpenAmbientKeys"
  | "onPasteApiKey"
  | "onSaveApiKey"
  | "onUseClipboardApiKey"
  | "onTestApiKey"
  | "onClearSavedApiKey"
  | "onAmbientCliSecretChange"
  | "onPasteAmbientCliSecret"
  | "onSaveAmbientCliSecret"
  | "onCloseAmbientCliSecret"
  | "onSetupLocalDeepResearch"
  | "onOpenSearchWebSettings"
  | "onCloseLocalDeepResearchFollowup"
  | "onChangeSubagentBarrierDecision"
  | "onCancelSubagentBarrierDecision"
  | "onConfirmSubagentBarrierDecision"
  | "onChangeSubagentApprovalDecision"
  | "onCancelSubagentApprovalDecision"
  | "onConfirmSubagentApprovalDecision"
  | "onRunPaletteCommand"
  | "onCloseCommandPalette"
  | "onChangeProjectActionName"
  | "onCancelProjectAction"
  | "onConfirmProjectAction"
  | "onCancelProjectBoardReset"
  | "onConfirmProjectBoardReset"
  | "onPlannerRevisionFeedbackChange"
  | "onCancelPlannerRevision"
  | "onConfirmPlannerRevision"
  | "onChangeThreadActionName"
  | "onCancelThreadAction"
  | "onConfirmThreadAction"
  | "onRequestFullAccess"
  | "onRespondPermissionRequest"
  | "onRespondPrivilegedCredentialRequest"
  | "onRespondSecureInputRequest"
  | "onCancelGitConfirmation"
  | "onConfirmGitConfirmation";

type ModalHostStateProps = Omit<AppModalHostProps, AdaptedModalHostPropKey>;

export type AppModalHostPropsInput = ModalHostStateProps & {
  clearSavedApiKey: () => MaybeAsyncUnknown;
  confirmProjectActionDialog: () => MaybeAsyncUnknown;
  confirmProjectBoardReset: () => MaybeAsyncUnknown;
  confirmThreadActionDialog: () => MaybeAsyncUnknown;
  openAmbientKeys: () => MaybeAsyncUnknown;
  openSearchWebSettings: () => void;
  pasteAmbientCliSecret: () => MaybeAsyncUnknown;
  pasteApiKey: () => MaybeAsyncUnknown;
  previewArtifact: (path: string) => void;
  requestThreadPermissionModeChange: (permissionMode: PermissionMode) => MaybeAsyncUnknown;
  respondPermissionRequest: (requestId: string, response: PermissionPromptResponseMode) => MaybeAsyncUnknown;
  respondPrivilegedCredentialRequest: (requestId: string, credential?: string) => MaybeAsyncUnknown;
  respondSecureInputRequest: (requestId: string, value?: string) => MaybeAsyncUnknown;
  runPaletteCommand: (command: CommandPaletteItem) => MaybeAsyncUnknown;
  saveAmbientCliSecret: () => MaybeAsyncUnknown;
  saveApiKey: (value?: string) => MaybeAsyncUnknown;
  setAmbientCliSecretDialog: Dispatch<SetStateAction<AmbientCliSecretDialogState | undefined>>;
  setApiDialogOpen: Dispatch<SetStateAction<boolean>>;
  setCommandPaletteOpen: Dispatch<SetStateAction<boolean>>;
  setGitConfirmation: Dispatch<SetStateAction<GitConfirmation | undefined>>;
  setLocalDeepResearchFollowupOpen: Dispatch<SetStateAction<boolean>>;
  setMediaPreviewModal: Dispatch<SetStateAction<MediaPreviewModalRequest | undefined>>;
  setPlannerRevisionDialog: Dispatch<SetStateAction<PlannerRevisionDialogState | undefined>>;
  setProjectActionDialog: Dispatch<SetStateAction<ProjectActionDialogState | undefined>>;
  setProjectBoardResetDialog: Dispatch<SetStateAction<ProjectBoardResetDialogState | undefined>>;
  setSubagentApprovalDecisionDialog: Dispatch<SetStateAction<SubagentApprovalDecisionDialogState | undefined>>;
  setSubagentBarrierDecisionDialog: Dispatch<SetStateAction<SubagentBarrierDecisionDialogState | undefined>>;
  setThreadActionDialog: Dispatch<SetStateAction<ThreadActionDialogState | undefined>>;
  setupLocalDeepResearchFromSettings: (action: LocalDeepResearchSetupAction) => MaybeAsyncUnknown;
  state: DesktopState;
  submitPlannerRevisionDialog: (feedback: string) => MaybeAsyncUnknown;
  submitSubagentApprovalDecisionDialog: () => MaybeAsyncUnknown;
  submitSubagentBarrierDecisionDialog: () => MaybeAsyncUnknown;
  testApiKey: () => MaybeAsyncUnknown;
  updateAmbientCliSecretDialog: (patch: Partial<AmbientCliSecretDialogState>) => void;
};

type AppModalHostActiveRequestInput = Pick<
  AppModalHostPropsInput,
  "activePermissionRequest" | "activePrivilegedCredentialRequest" | "activeSecureInputRequest"
>;

type AppModalHostCredentialDialogActions = Pick<
  AppModalHostPropsInput,
  | "clearSavedApiKey"
  | "openAmbientKeys"
  | "pasteAmbientCliSecret"
  | "pasteApiKey"
  | "saveAmbientCliSecret"
  | "saveApiKey"
  | "testApiKey"
  | "updateAmbientCliSecretDialog"
>;

type AppModalHostLocalRuntimeActions = Pick<AppModalHostPropsInput, "setupLocalDeepResearchFromSettings">;

type AppModalHostPermissionActions = Pick<
  AppModalHostPropsInput,
  "requestThreadPermissionModeChange" | "respondPermissionRequest" | "respondPrivilegedCredentialRequest" | "respondSecureInputRequest"
>;

type AppModalHostProjectThreadActions = Pick<AppModalHostPropsInput, "confirmProjectActionDialog" | "confirmThreadActionDialog">;

type AppModalHostShellCommandActions = Pick<AppModalHostPropsInput, "commandItems" | "runPaletteCommand">;

type AppModalHostSecurityPromptStateInput = Pick<
  ReturnType<typeof useAppSecurityPromptState>,
  | "ambientCliSecretDialog"
  | "ambientCliSecretInputRef"
  | "apiDialogOpen"
  | "apiKeyBusy"
  | "apiKeyDraft"
  | "apiKeyInputRef"
  | "apiKeyStatus"
  | "clipboardCandidate"
  | "setAmbientCliSecretDialog"
  | "setApiDialogOpen"
  | "setApiKeyDraft"
>;

type AppModalHostShellUiStateInput = Pick<
  ReturnType<typeof useAppShellUiState>,
  | "commandPaletteOpen"
  | "commandPaletteQuery"
  | "mediaPreviewModal"
  | "setCommandPaletteOpen"
  | "setCommandPaletteQuery"
  | "setMediaPreviewModal"
>;

type AppModalHostProviderRuntimeStateInput = Pick<
  ReturnType<typeof useAppProviderRuntimeState>,
  | "localDeepResearchFollowupOpen"
  | "localDeepResearchQ8Override"
  | "localDeepResearchSetup"
  | "setLocalDeepResearchFollowupOpen"
  | "setLocalDeepResearchQ8Override"
>;

type AppModalHostProjectShellStateInput = Pick<
  ReturnType<typeof useAppProjectShellState>,
  | "plannerRevisionDialog"
  | "projectActionDialog"
  | "projectBoardResetDialog"
  | "setPlannerRevisionDialog"
  | "setProjectActionDialog"
  | "setProjectBoardResetDialog"
  | "setThreadActionDialog"
  | "threadActionDialog"
>;

type AppModalHostWorkflowRuntimeStateInput = Pick<
  ReturnType<typeof useAppWorkflowRuntimeState>,
  | "goalBudgetDialog"
  | "setSubagentApprovalDecisionDialog"
  | "setSubagentBarrierDecisionDialog"
  | "subagentApprovalDecisionDialog"
  | "subagentBarrierDecisionDialog"
>;

type AppModalHostWorkspaceShellStateInput = Pick<ReturnType<typeof useAppWorkspaceShellState>, "gitConfirmation" | "setGitConfirmation">;

export type AppModalHostPropsForAppActions = {
  credentialDialogActions: AppModalHostCredentialDialogActions;
  localRuntimeActions: AppModalHostLocalRuntimeActions;
  openSearchWebSettings: AppModalHostPropsInput["openSearchWebSettings"];
  permissionActions: AppModalHostPermissionActions;
  previewArtifact: AppModalHostPropsInput["previewArtifact"];
  projectBoardActions: Pick<AppModalHostPropsInput, "confirmProjectBoardReset">;
  projectThreadActions: AppModalHostProjectThreadActions;
  shellCommandActions: AppModalHostShellCommandActions;
  goalBudgetActions: Pick<
    AppModalHostPropsInput,
    "onCancelGoalBudget" | "onConfirmGoalBudget" | "onGoalBudgetChange"
  >;
  submitPlannerRevisionDialog: AppModalHostPropsInput["submitPlannerRevisionDialog"];
  submitSubagentApprovalDecisionDialog: AppModalHostPropsInput["submitSubagentApprovalDecisionDialog"];
  submitSubagentBarrierDecisionDialog: AppModalHostPropsInput["submitSubagentBarrierDecisionDialog"];
};

export type AppModalHostPropsForAppInput = AppModalHostActiveRequestInput & {
  actions: AppModalHostPropsForAppActions;
  providerRuntimeState: AppModalHostProviderRuntimeStateInput;
  projectShellState: AppModalHostProjectShellStateInput;
  securityPromptState: AppModalHostSecurityPromptStateInput;
  shellUiState: AppModalHostShellUiStateInput;
  state: DesktopState;
  subagentUiEnabled: AppModalHostPropsInput["subagentUiEnabled"];
  workflowRuntimeState: AppModalHostWorkflowRuntimeStateInput;
  workspaceShellState: AppModalHostWorkspaceShellStateInput;
};

export function createAppModalHostPropsForApp({
  actions,
  activePermissionRequest,
  activePrivilegedCredentialRequest,
  activeSecureInputRequest,
  providerRuntimeState,
  projectShellState,
  securityPromptState,
  shellUiState,
  state,
  subagentUiEnabled,
  workflowRuntimeState,
  workspaceShellState,
}: AppModalHostPropsForAppInput): AppModalHostProps {
  return createAppModalHostProps({
    activePermissionRequest,
    activePrivilegedCredentialRequest,
    activeSecureInputRequest,
    ambientCliSecretDialog: securityPromptState.ambientCliSecretDialog,
    ambientCliSecretInputRef: securityPromptState.ambientCliSecretInputRef,
    apiDialogOpen: securityPromptState.apiDialogOpen,
    apiKeyBusy: securityPromptState.apiKeyBusy,
    apiKeyDraft: securityPromptState.apiKeyDraft,
    apiKeyInputRef: securityPromptState.apiKeyInputRef,
    apiKeyStatus: securityPromptState.apiKeyStatus,
    clearSavedApiKey: actions.credentialDialogActions.clearSavedApiKey,
    clipboardCandidate: securityPromptState.clipboardCandidate,
    commandItems: actions.shellCommandActions.commandItems,
    commandPaletteOpen: shellUiState.commandPaletteOpen,
    commandPaletteQuery: shellUiState.commandPaletteQuery,
    confirmProjectActionDialog: actions.projectThreadActions.confirmProjectActionDialog,
    confirmProjectBoardReset: actions.projectBoardActions.confirmProjectBoardReset,
    confirmThreadActionDialog: actions.projectThreadActions.confirmThreadActionDialog,
    gitConfirmation: workspaceShellState.gitConfirmation,
    goalBudgetDialog: workflowRuntimeState.goalBudgetDialog,
    localDeepResearchFollowupOpen: providerRuntimeState.localDeepResearchFollowupOpen,
    localDeepResearchQ8Override: providerRuntimeState.localDeepResearchQ8Override,
    localDeepResearchSetup: providerRuntimeState.localDeepResearchSetup,
    mediaPreviewModal: shellUiState.mediaPreviewModal,
    onApiKeyChange: securityPromptState.setApiKeyDraft,
    onCommandPaletteQueryChange: shellUiState.setCommandPaletteQuery,
    onCancelGoalBudget: actions.goalBudgetActions.onCancelGoalBudget,
    onConfirmGoalBudget: actions.goalBudgetActions.onConfirmGoalBudget,
    onGoalBudgetChange: actions.goalBudgetActions.onGoalBudgetChange,
    onLocalDeepResearchQ8OverrideChange: providerRuntimeState.setLocalDeepResearchQ8Override,
    openAmbientKeys: actions.credentialDialogActions.openAmbientKeys,
    openSearchWebSettings: actions.openSearchWebSettings,
    pasteAmbientCliSecret: actions.credentialDialogActions.pasteAmbientCliSecret,
    pasteApiKey: actions.credentialDialogActions.pasteApiKey,
    plannerRevisionDialog: projectShellState.plannerRevisionDialog,
    previewArtifact: actions.previewArtifact,
    projectActionDialog: projectShellState.projectActionDialog,
    projectBoardResetDialog: projectShellState.projectBoardResetDialog,
    requestThreadPermissionModeChange: actions.permissionActions.requestThreadPermissionModeChange,
    respondPermissionRequest: actions.permissionActions.respondPermissionRequest,
    respondPrivilegedCredentialRequest: actions.permissionActions.respondPrivilegedCredentialRequest,
    respondSecureInputRequest: actions.permissionActions.respondSecureInputRequest,
    runPaletteCommand: actions.shellCommandActions.runPaletteCommand,
    saveAmbientCliSecret: actions.credentialDialogActions.saveAmbientCliSecret,
    saveApiKey: actions.credentialDialogActions.saveApiKey,
    setAmbientCliSecretDialog: securityPromptState.setAmbientCliSecretDialog,
    setApiDialogOpen: securityPromptState.setApiDialogOpen,
    setCommandPaletteOpen: shellUiState.setCommandPaletteOpen,
    setGitConfirmation: workspaceShellState.setGitConfirmation,
    setLocalDeepResearchFollowupOpen: providerRuntimeState.setLocalDeepResearchFollowupOpen,
    setMediaPreviewModal: shellUiState.setMediaPreviewModal,
    setPlannerRevisionDialog: projectShellState.setPlannerRevisionDialog,
    setProjectActionDialog: projectShellState.setProjectActionDialog,
    setProjectBoardResetDialog: projectShellState.setProjectBoardResetDialog,
    setSubagentApprovalDecisionDialog: workflowRuntimeState.setSubagentApprovalDecisionDialog,
    setSubagentBarrierDecisionDialog: workflowRuntimeState.setSubagentBarrierDecisionDialog,
    setThreadActionDialog: projectShellState.setThreadActionDialog,
    setupLocalDeepResearchFromSettings: actions.localRuntimeActions.setupLocalDeepResearchFromSettings,
    state,
    subagentApprovalDecisionDialog: workflowRuntimeState.subagentApprovalDecisionDialog,
    subagentBarrierDecisionDialog: workflowRuntimeState.subagentBarrierDecisionDialog,
    subagentUiEnabled,
    submitPlannerRevisionDialog: actions.submitPlannerRevisionDialog,
    submitSubagentApprovalDecisionDialog: actions.submitSubagentApprovalDecisionDialog,
    submitSubagentBarrierDecisionDialog: actions.submitSubagentBarrierDecisionDialog,
    testApiKey: actions.credentialDialogActions.testApiKey,
    threadActionDialog: projectShellState.threadActionDialog,
    updateAmbientCliSecretDialog: actions.credentialDialogActions.updateAmbientCliSecretDialog,
  });
}

export function createAppModalHostProps({
  clearSavedApiKey,
  confirmProjectActionDialog,
  confirmProjectBoardReset,
  confirmThreadActionDialog,
  openAmbientKeys,
  openSearchWebSettings,
  pasteAmbientCliSecret,
  pasteApiKey,
  previewArtifact,
  requestThreadPermissionModeChange,
  respondPermissionRequest,
  respondPrivilegedCredentialRequest,
  respondSecureInputRequest,
  runPaletteCommand,
  saveAmbientCliSecret,
  saveApiKey,
  setAmbientCliSecretDialog,
  setApiDialogOpen,
  setCommandPaletteOpen,
  setGitConfirmation,
  setLocalDeepResearchFollowupOpen,
  setMediaPreviewModal,
  setPlannerRevisionDialog,
  setProjectActionDialog,
  setProjectBoardResetDialog,
  setSubagentApprovalDecisionDialog,
  setSubagentBarrierDecisionDialog,
  setThreadActionDialog,
  setupLocalDeepResearchFromSettings,
  state,
  submitPlannerRevisionDialog,
  submitSubagentApprovalDecisionDialog,
  submitSubagentBarrierDecisionDialog,
  testApiKey,
  updateAmbientCliSecretDialog,
  ...props
}: AppModalHostPropsInput): AppModalHostProps {
  return {
    ...props,
    generatedMediaAutoplay: state.settings.media.generatedMediaAutoplay,
    provider: state.provider,
    permissionMode: state.settings.permissionMode,
    onCloseMediaPreview: () => setMediaPreviewModal(undefined),
    onOpenMediaPreviewInFiles: previewArtifact,
    onCloseApiKey: () => setApiDialogOpen(false),
    onOpenAmbientKeys: () => {
      void openAmbientKeys();
    },
    onPasteApiKey: () => {
      void pasteApiKey();
    },
    onSaveApiKey: () => {
      void saveApiKey();
    },
    onUseClipboardApiKey: () => {
      void saveApiKey(props.clipboardCandidate);
    },
    onTestApiKey: () => {
      void testApiKey();
    },
    onClearSavedApiKey: () => {
      void clearSavedApiKey();
    },
    onAmbientCliSecretChange: updateAmbientCliSecretDialog,
    onPasteAmbientCliSecret: () => {
      void pasteAmbientCliSecret();
    },
    onSaveAmbientCliSecret: () => {
      void saveAmbientCliSecret();
    },
    onCloseAmbientCliSecret: () => setAmbientCliSecretDialog(undefined),
    onSetupLocalDeepResearch: (action) => {
      void setupLocalDeepResearchFromSettings(action);
    },
    onOpenSearchWebSettings: () => {
      setLocalDeepResearchFollowupOpen(false);
      openSearchWebSettings();
    },
    onCloseLocalDeepResearchFollowup: () => setLocalDeepResearchFollowupOpen(false),
    onChangeSubagentBarrierDecision: (patch) =>
      setSubagentBarrierDecisionDialog((current) => (current ? { ...current, ...patch, error: undefined } : current)),
    onCancelSubagentBarrierDecision: () => {
      if (!props.subagentBarrierDecisionDialog?.busy) setSubagentBarrierDecisionDialog(undefined);
    },
    onConfirmSubagentBarrierDecision: () => {
      void submitSubagentBarrierDecisionDialog();
    },
    onChangeSubagentApprovalDecision: (patch) =>
      setSubagentApprovalDecisionDialog((current) => (current ? { ...current, ...patch, error: undefined } : current)),
    onCancelSubagentApprovalDecision: () => {
      if (!props.subagentApprovalDecisionDialog?.busy) setSubagentApprovalDecisionDialog(undefined);
    },
    onConfirmSubagentApprovalDecision: () => {
      void submitSubagentApprovalDecisionDialog();
    },
    onRunPaletteCommand: (command) => {
      void runPaletteCommand(command);
    },
    onCloseCommandPalette: () => setCommandPaletteOpen(false),
    onChangeProjectActionName: (name) => setProjectActionDialog((current) => (current?.kind === "rename" ? { ...current, name } : current)),
    onCancelProjectAction: () => setProjectActionDialog(undefined),
    onConfirmProjectAction: () => {
      void confirmProjectActionDialog();
    },
    onCancelProjectBoardReset: () => setProjectBoardResetDialog(undefined),
    onConfirmProjectBoardReset: () => {
      void confirmProjectBoardReset();
    },
    onPlannerRevisionFeedbackChange: () =>
      setPlannerRevisionDialog((current) => (current?.error ? { ...current, error: undefined } : current)),
    onCancelPlannerRevision: () => setPlannerRevisionDialog(undefined),
    onConfirmPlannerRevision: (feedback) => {
      void submitPlannerRevisionDialog(feedback);
    },
    onChangeThreadActionName: (name) => setThreadActionDialog((current) => (current?.kind === "rename" ? { ...current, name } : current)),
    onCancelThreadAction: () => setThreadActionDialog(undefined),
    onConfirmThreadAction: () => {
      void confirmThreadActionDialog();
    },
    onRequestFullAccess: () => {
      void requestThreadPermissionModeChange("full-access");
    },
    onRespondPermissionRequest: (request, response) => {
      void respondPermissionRequest(request.id, response);
    },
    onRespondPrivilegedCredentialRequest: (request, credential) => {
      void respondPrivilegedCredentialRequest(request.id, credential);
    },
    onRespondSecureInputRequest: (request, value) => {
      void respondSecureInputRequest(request.id, value);
    },
    onCancelGitConfirmation: () => setGitConfirmation(undefined),
    onConfirmGitConfirmation: async (confirmation) => {
      const action = confirmation.onConfirm;
      setGitConfirmation(undefined);
      await action();
    },
  };
}
