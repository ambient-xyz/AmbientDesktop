import type { Dispatch, SetStateAction } from "react";

import type { DesktopState, ThinkingDisplayMode } from "../../shared/desktopTypes";
import type { RunStatus } from "../../shared/threadTypes";
import {
  useAppActiveThreadModel,
  type AppActiveThreadModel,
  type AppActiveThreadModelInput,
} from "./AppActiveThreadModel";
import type { useAppAutomationShellState } from "./AppAutomationShellState";
import type { useAppComposerShellState } from "./AppComposerShellState";
import {
  type AppLocalDeepResearchModeControls,
  useAppPendingSubmittedPromptCleanup,
} from "./AppComposerInteractionControls";
import {
  useAppConversationDisplayModel,
  type AppConversationDisplayModel,
} from "./AppConversationDisplayModel";
import { hasVisibleAssistantReply } from "./thinkingDisplayUiModel";
import type { createAppNavigationActionsForApp } from "./AppNavigationActions";
import type { RunActivityLine } from "./AppRunActivity";
import type { useAppRunActivityState } from "./AppRunActivityState";
import type { useAppSecurityPromptState } from "./AppSecurityPromptState";
import { useAppLocalDeepResearchReadinessLifecycleEffect } from "./AppShellLifecycleEffects";
import type { useAppShellUiState } from "./AppShellUiState";
import { useAppSidebarLifecycleEffects } from "./AppSidebarLifecycleEffects";
import {
  useAppSidebarSelectionModel,
  type AppSidebarSelectionModel,
} from "./AppSidebarSelectionModel";
import {
  createAppSubagentParentClusterActionsForApp,
  type AppSubagentParentClusterActionsForAppInput,
} from "./AppSubagentParentClusterActions";
import { useAppSubagentShellControls } from "./AppSubagentShellControls";
import { useAppWorkflowRecordingReviewControls } from "./AppWorkflowRecordingReviewControls";
import type { useAppWorkflowRuntimeState } from "./AppWorkflowRuntimeState";
import type { useAppWorkspaceShellState } from "./AppWorkspaceShellState";

type AppRunActivityStateForMainSurfaceThreadModels = Pick<
  ReturnType<typeof useAppRunActivityState>,
  "activity" | "runStatus" | "threadRunStatuses"
>;

type AppWorkspaceShellStateForMainSurfaceThreadModels = Pick<
  ReturnType<typeof useAppWorkspaceShellState>,
  "chatBrowserUserAction"
>;

type AppSecurityPromptStateForMainSurfaceThreadModels = Pick<
  ReturnType<typeof useAppSecurityPromptState>,
  "permissionRequests" | "privilegedCredentialRequests" | "secureInputRequests"
>;

type AppShellUiStateForMainSurfaceThreadModels = Pick<ReturnType<typeof useAppShellUiState>, "sidebarArea">;

type AppWorkflowRuntimeStateForMainSurfaceThreadModels = Pick<
  ReturnType<typeof useAppWorkflowRuntimeState>,
  | "localDeepResearchBudgetOverride"
  | "localDeepResearchRunBudgetRef"
  | "setSubagentApprovalActionBusy"
  | "setSubagentApprovalDecisionDialog"
  | "setSubagentBarrierActionBusy"
  | "setSubagentBarrierDecisionDialog"
  | "setSubagentChildCancelBusy"
  | "setSubagentChildCloseBusy"
  | "setSymphonyBuilderDraft"
  | "symphonyBuilderDraft"
>;

type AppAutomationShellStateForMainSurfaceThreadModels =
  AppSubagentParentClusterActionsForAppInput["automationShellState"];

type AppProjectShellStateForMainSurfaceThreadModels =
  AppSubagentParentClusterActionsForAppInput["projectShellState"];

type AppWorkflowRecordingLibraryControlsForMainSurfaceThreadModels =
  AppSubagentParentClusterActionsForAppInput["workflowRecordingLibraryControls"];

type AppWorkflowRuntimeStateForSubagentParentClusterActions =
  AppSubagentParentClusterActionsForAppInput["workflowRuntimeState"];

type AppShellUiStateForSubagentParentClusterActions =
  AppSubagentParentClusterActionsForAppInput["shellUiState"];

export interface AppMainSurfaceThreadModelsForAppInput {
  automationShellState: AppAutomationShellStateForMainSurfaceThreadModels;
  localDeepResearchReady: boolean;
  projectShellState: AppProjectShellStateForMainSurfaceThreadModels;
  promptRequestMatchesActiveProject: AppActiveThreadModelInput["promptRequestMatchesActiveProject"];
  runActivityState: AppRunActivityStateForMainSurfaceThreadModels;
  running: boolean;
  securityPromptState: AppSecurityPromptStateForMainSurfaceThreadModels;
  setState: Dispatch<SetStateAction<DesktopState | undefined>>;
  shellUiState: AppShellUiStateForMainSurfaceThreadModels & AppShellUiStateForSubagentParentClusterActions;
  state: DesktopState | undefined;
  workflowRecorderSurface: Parameters<typeof useAppWorkflowRecordingReviewControls>[0]["workflowRecorderSurface"];
  workflowRecordingLibraryControls: AppWorkflowRecordingLibraryControlsForMainSurfaceThreadModels;
  workflowRuntimeState: AppWorkflowRuntimeStateForMainSurfaceThreadModels & AppWorkflowRuntimeStateForSubagentParentClusterActions;
  workspaceShellState: AppWorkspaceShellStateForMainSurfaceThreadModels;
}

export interface AppMainSurfaceThreadModelsForAppResult {
  activeThread: AppActiveThreadModel["activeThread"];
  activeThreadModel: AppActiveThreadModel;
  localDeepResearchRunActive: boolean;
  subagentParentClusterActions: ReturnType<typeof createAppSubagentParentClusterActionsForApp>;
  subagentShellControls: ReturnType<typeof useAppSubagentShellControls>;
  subagentUiEnabled: boolean;
  workflowRecordingReviewControls: ReturnType<typeof useAppWorkflowRecordingReviewControls>;
}

export function useAppMainSurfaceThreadModelsForApp({
  automationShellState,
  localDeepResearchReady,
  projectShellState,
  promptRequestMatchesActiveProject,
  runActivityState,
  running,
  securityPromptState,
  setState,
  shellUiState,
  state,
  workflowRecorderSurface,
  workflowRecordingLibraryControls,
  workflowRuntimeState,
  workspaceShellState,
}: AppMainSurfaceThreadModelsForAppInput): AppMainSurfaceThreadModelsForAppResult {
  const activeThreadModel = useAppActiveThreadModel({
    activity: runActivityState.activity,
    chatBrowserUserAction: workspaceShellState.chatBrowserUserAction,
    localDeepResearchBudgetOverride: workflowRuntimeState.localDeepResearchBudgetOverride,
    localDeepResearchReady,
    permissionRequests: securityPromptState.permissionRequests,
    platform: navigator.platform,
    privilegedCredentialRequests: securityPromptState.privilegedCredentialRequests,
    promptRequestMatchesActiveProject,
    secureInputRequests: securityPromptState.secureInputRequests,
    sidebarArea: shellUiState.sidebarArea,
    state,
    threadRunStatuses: runActivityState.threadRunStatuses,
  });
  const {
    activeThread,
    localDeepResearchRunActive,
    localDeepResearchRunBudget,
  } = activeThreadModel;
  workflowRuntimeState.localDeepResearchRunBudgetRef.current = localDeepResearchRunBudget;

  const subagentShellControls = useAppSubagentShellControls({
    activeThread,
    setSubagentApprovalActionBusy: workflowRuntimeState.setSubagentApprovalActionBusy,
    setSubagentApprovalDecisionDialog: workflowRuntimeState.setSubagentApprovalDecisionDialog,
    setSubagentBarrierActionBusy: workflowRuntimeState.setSubagentBarrierActionBusy,
    setSubagentBarrierDecisionDialog: workflowRuntimeState.setSubagentBarrierDecisionDialog,
    setSubagentChildCancelBusy: workflowRuntimeState.setSubagentChildCancelBusy,
    setSubagentChildCloseBusy: workflowRuntimeState.setSubagentChildCloseBusy,
    setSymphonyBuilderDraft: workflowRuntimeState.setSymphonyBuilderDraft,
    state,
    symphonyBuilderDraft: workflowRuntimeState.symphonyBuilderDraft,
  });
  const { subagentUiEnabled } = subagentShellControls;

  const subagentParentClusterActions = createAppSubagentParentClusterActionsForApp({
    automationShellState,
    projectShellState,
    setState,
    shellUiState,
    workflowRecordingLibraryControls,
    workflowRuntimeState,
  });
  const workflowRecordingReviewControls = useAppWorkflowRecordingReviewControls({
    activeThread,
    hasPriorAssistantReply: hasVisibleAssistantReply(state?.messages ?? []),
    running,
    runStatus: runActivityState.runStatus,
    thinkingDisplay: state?.settings.thinkingDisplay,
    workflowRecorderSurface,
  });

  return {
    activeThread,
    activeThreadModel,
    localDeepResearchRunActive,
    subagentParentClusterActions,
    subagentShellControls,
    subagentUiEnabled,
    workflowRecordingReviewControls,
  };
}

type AppAutomationShellStateForMainSurfaceLifecycleModels = Pick<
  ReturnType<typeof useAppAutomationShellState>,
  | "automationFolders"
  | "selectedAutomationFolderId"
  | "selectedAutomationThreadId"
  | "selectedWorkflowAgentFolderId"
  | "selectedWorkflowAgentThreadId"
  | "sidebarOrganize"
  | "workflowAgentFolders"
>;

type AppComposerShellStateForMainSurfaceLifecycleModels = Pick<
  ReturnType<typeof useAppComposerShellState>,
  "setComposerDraft"
>;

type AppNavigationActionsForMainSurfaceLifecycleModels = Pick<
  ReturnType<typeof createAppNavigationActionsForApp>,
  "loadAutomationFolders" | "loadWorkflowAgentFolders" | "selectThread"
>;

type AppShellUiStateForMainSurfaceLifecycleModels = Pick<ReturnType<typeof useAppShellUiState>, "setError" | "sidebarArea">;

type AppWorkflowRuntimeStateForMainSurfaceLifecycleModels = Pick<
  ReturnType<typeof useAppWorkflowRuntimeState>,
  | "orchestrationAutoRevision"
  | "orchestrationRevision"
  | "pendingProjectComposerDraft"
  | "pendingSubmittedPrompts"
  | "promptHistoryRef"
  | "setPendingProjectComposerDraft"
  | "setPendingSubmittedPrompts"
  | "workflowRevision"
>;

export interface AppMainSurfaceLifecycleModelsForAppInput {
  activeRunActivityLines: RunActivityLine[];
  activeThread: AppActiveThreadModel["activeThread"];
  automationShellState: AppAutomationShellStateForMainSurfaceLifecycleModels;
  composerShellState: AppComposerShellStateForMainSurfaceLifecycleModels;
  localDeepResearchReady: boolean;
  navigationActions: AppNavigationActionsForMainSurfaceLifecycleModels;
  running: boolean;
  runStatus: RunStatus;
  setLocalDeepResearchModeArmed: AppLocalDeepResearchModeControls["setLocalDeepResearchModeArmed"];
  shellUiState: AppShellUiStateForMainSurfaceLifecycleModels;
  state: DesktopState | undefined;
  subagentUiEnabled: boolean;
  thinkingDisplayMode: ThinkingDisplayMode;
  workflowRuntimeState: AppWorkflowRuntimeStateForMainSurfaceLifecycleModels;
}

export interface AppMainSurfaceLifecycleModelsForAppResult {
  conversationDisplayModel: AppConversationDisplayModel;
  sidebarSelectionModel: AppSidebarSelectionModel;
}

export function useAppMainSurfaceLifecycleModelsForApp({
  activeRunActivityLines,
  activeThread,
  automationShellState,
  composerShellState,
  localDeepResearchReady,
  navigationActions,
  running,
  runStatus,
  setLocalDeepResearchModeArmed,
  shellUiState,
  state,
  subagentUiEnabled,
  thinkingDisplayMode,
  workflowRuntimeState,
}: AppMainSurfaceLifecycleModelsForAppInput): AppMainSurfaceLifecycleModelsForAppResult {
  useAppLocalDeepResearchReadinessLifecycleEffect({
    localDeepResearchReady,
    setLocalDeepResearchModeArmed,
  });
  const conversationDisplayModel = useAppConversationDisplayModel({
    activeThreadId: state?.activeThreadId,
    activeRunActivityLines,
    activeWorkspacePath: state?.activeWorkspace.path,
    messages: state?.messages,
    pendingSubmittedPrompts: workflowRuntimeState.pendingSubmittedPrompts,
    plannerPlanArtifacts: state?.plannerPlanArtifacts,
    running,
    runStatus,
    thinkingDisplayMode,
    workspacePath: state?.workspace.path,
  });
  workflowRuntimeState.promptHistoryRef.current = conversationDisplayModel.promptHistory;

  useAppPendingSubmittedPromptCleanup({
    pendingSubmittedPrompts: workflowRuntimeState.pendingSubmittedPrompts,
    running,
    setPendingSubmittedPrompts: workflowRuntimeState.setPendingSubmittedPrompts,
    state,
  });

  const sidebarSelectionModel = useAppSidebarSelectionModel({
    activeThreadId: state?.activeThreadId,
    activeWorkspacePath: state?.workspace.path,
    automationFolders: automationShellState.automationFolders,
    projects: state?.projects ?? [],
    selectedAutomationFolderId: automationShellState.selectedAutomationFolderId,
    selectedAutomationThreadId: automationShellState.selectedAutomationThreadId,
    selectedWorkflowAgentFolderId: automationShellState.selectedWorkflowAgentFolderId,
    selectedWorkflowAgentThreadId: automationShellState.selectedWorkflowAgentThreadId,
    sidebarOrganize: automationShellState.sidebarOrganize,
    subagentUiEnabled,
    workflowAgentFolders: automationShellState.workflowAgentFolders,
  });
  useAppSidebarLifecycleEffects({
    activeThreadId: activeThread?.id,
    activeThreadKind: activeThread?.kind,
    activeThreadParentThreadId: activeThread?.parentThreadId,
    activeThreadWorkspacePath: activeThread?.workspacePath,
    loadAutomationFolders: navigationActions.loadAutomationFolders,
    loadWorkflowAgentFolders: navigationActions.loadWorkflowAgentFolders,
    orchestrationAutoRevision: workflowRuntimeState.orchestrationAutoRevision,
    orchestrationRevision: workflowRuntimeState.orchestrationRevision,
    pendingProjectComposerDraft: workflowRuntimeState.pendingProjectComposerDraft,
    selectThread: navigationActions.selectThread,
    setComposerDraft: composerShellState.setComposerDraft,
    setError: shellUiState.setError,
    setPendingProjectComposerDraft: workflowRuntimeState.setPendingProjectComposerDraft,
    sidebarArea: shellUiState.sidebarArea,
    subagentUiEnabled,
    workflowRevision: workflowRuntimeState.workflowRevision,
    workspacePath: state?.workspace.path,
  });

  return {
    conversationDisplayModel,
    sidebarSelectionModel,
  };
}
