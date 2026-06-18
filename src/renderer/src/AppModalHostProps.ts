import type { Dispatch, SetStateAction } from "react";

import type { DesktopState } from "../../shared/desktopTypes";
import type { LocalDeepResearchSetupAction } from "../../shared/localRuntimeTypes";
import type { PermissionMode, PermissionPromptResponseMode } from "../../shared/permissionTypes";
import type {
  AppModalHostProps,
  SubagentApprovalDecisionDialogState,
  SubagentBarrierDecisionDialogState,
} from "./AppModalHost";
import type { AmbientCliSecretDialogState, CommandPaletteItem } from "./AppDialogs";
import type {
  PlannerRevisionDialogState,
  ProjectActionDialogState,
  ProjectBoardResetDialogState,
  ThreadActionDialogState,
} from "./AppActionDialogs";
import type { MediaPreviewModalRequest } from "./AppToolMessages";
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
    onChangeProjectActionName: (name) =>
      setProjectActionDialog((current) => (current?.kind === "rename" ? { ...current, name } : current)),
    onCancelProjectAction: () => setProjectActionDialog(undefined),
    onConfirmProjectAction: () => {
      void confirmProjectActionDialog();
    },
    onCancelProjectBoardReset: () => setProjectBoardResetDialog(undefined),
    onConfirmProjectBoardReset: () => {
      void confirmProjectBoardReset();
    },
    onPlannerRevisionFeedbackChange: () => setPlannerRevisionDialog((current) => (current?.error ? { ...current, error: undefined } : current)),
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
