import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import type { DesktopState } from "../../shared/desktopTypes";
import { useAppChatFindControls } from "./AppChatFindControls";
import { useAppComposerModelPickerControls } from "./AppComposerModelPickerControls";
import { createAppLocalDeepResearchModeControls } from "./AppComposerInteractionControls";
import { createAppCredentialDialogActions } from "./AppCredentialDialogActions";
import { createAppDesktopStateAppliers } from "./AppDesktopStateAppliers";
import { createAppDesktopStateMemoryControls } from "./AppDesktopStateMemoryControls";
import { type AppInteractionGraphForAppInput, useAppInteractionGraphForApp } from "./AppInteractionGraph";
import { createAppNavigationActionsForApp } from "./AppNavigationActions";
import { createAppPermissionActions } from "./AppPermissionActions";
import { createAppPromptHistoryControls } from "./AppPromptHistoryControls";
import { useAppWorkflowRecordingLibraryControls } from "./AppWorkflowRecordingLibraryControls";

const mocks = vi.hoisted(() => ({
  appDesktopStateAppliers: {
    applyAutomationDesktopState: vi.fn(),
    applyCreatedThreadState: vi.fn(),
    applyProjectActionState: vi.fn(),
  },
  chatFindControls: {
    chatFindOpen: true,
    setChatFindQuery: vi.fn(),
  },
  composerModelPickerControls: {
    modelPickerOpen: true,
  },
  credentialDialogActions: {
    openAmbientCliSecretDialog: vi.fn(),
    openApiKeyDialog: vi.fn(),
  },
  localDeepResearchModeControls: {
    setLocalDeepResearchModeArmed: vi.fn(),
    toggleLocalDeepResearchMode: vi.fn(),
  },
  navigationActions: {
    selectThread: vi.fn(),
  },
  permissionActions: {
    loadPermissionAudit: vi.fn(),
  },
  promptHistoryControls: {
    navigatePromptHistory: vi.fn(),
    resetPromptHistory: vi.fn(),
    shouldNavigatePromptHistory: vi.fn(),
  },
  workflowRecordingLibraryControls: {
    setSelectedWorkflowRecordingId: vi.fn(),
  },
  createAppCredentialDialogActions: vi.fn(),
  createAppDesktopStateAppliers: vi.fn(),
  createAppDesktopStateMemoryControls: vi.fn(),
  createAppLocalDeepResearchModeControls: vi.fn(),
  createAppNavigationActionsForApp: vi.fn(),
  createAppPermissionActions: vi.fn(),
  createAppPromptHistoryControls: vi.fn(),
  useAppChatFindControls: vi.fn(),
  useAppComposerModelPickerControls: vi.fn(),
  useAppWorkflowRecordingLibraryControls: vi.fn(),
}));

vi.mock("./AppChatFindControls", () => ({
  useAppChatFindControls: mocks.useAppChatFindControls,
}));

vi.mock("./AppComposerModelPickerControls", () => ({
  useAppComposerModelPickerControls: mocks.useAppComposerModelPickerControls,
}));

vi.mock("./AppComposerInteractionControls", () => ({
  createAppLocalDeepResearchModeControls: mocks.createAppLocalDeepResearchModeControls,
}));

vi.mock("./AppCredentialDialogActions", () => ({
  createAppCredentialDialogActions: mocks.createAppCredentialDialogActions,
}));

vi.mock("./AppDesktopStateAppliers", () => ({
  createAppDesktopStateAppliers: mocks.createAppDesktopStateAppliers,
}));

vi.mock("./AppDesktopStateMemoryControls", () => ({
  createAppDesktopStateMemoryControls: mocks.createAppDesktopStateMemoryControls,
}));

vi.mock("./AppNavigationActions", () => ({
  createAppNavigationActionsForApp: mocks.createAppNavigationActionsForApp,
}));

vi.mock("./AppPermissionActions", () => ({
  createAppPermissionActions: mocks.createAppPermissionActions,
}));

vi.mock("./AppPromptHistoryControls", () => ({
  createAppPromptHistoryControls: mocks.createAppPromptHistoryControls,
}));

vi.mock("./AppWorkflowRecordingLibraryControls", () => ({
  useAppWorkflowRecordingLibraryControls: mocks.useAppWorkflowRecordingLibraryControls,
}));

describe("App interaction graph", () => {
  it("wires App state owners into interaction controls", () => {
    const input = createInput();

    let graph: ReturnType<typeof useAppInteractionGraphForApp> | undefined;
    function Harness() {
      graph = useAppInteractionGraphForApp(input);
      return React.createElement("div");
    }

    renderToStaticMarkup(React.createElement(Harness));

    expect(createAppDesktopStateMemoryControls).toHaveBeenCalledWith({
      activeProjectRootRef: input.workspaceShellState.activeProjectRootRef,
      activeThreadIdRef: input.workspaceShellState.activeThreadIdRef,
      clearedGoalKeysRef: input.workflowRuntimeState.clearedGoalKeysRef,
      latestDesktopStateRevisionRef: input.workflowRuntimeState.latestDesktopStateRevisionRef,
      workspaceProjectAliasesRef: input.workspaceShellState.workspaceProjectAliasesRef,
    });
    expect(createAppDesktopStateAppliers).toHaveBeenCalledWith(
      expect.objectContaining({
        activeWorkspacePath: "/repo/active",
        closeProjectBoard: input.closeProjectBoard,
        rememberDesktopState: graph?.rememberDesktopState,
        setComposerDraft: input.composerShellState.setComposerDraft,
        setRunStatus: input.runActivityState.setRunStatus,
        setSidebarArea: input.shellUiState.setSidebarArea,
        setState: input.setState,
        setThreadRunStatuses: input.runActivityState.setThreadRunStatuses,
        setWorkspaceRevision: input.workspaceShellState.setWorkspaceRevision,
        threadRunStatuses: input.runActivityState.threadRunStatuses,
      }),
    );
    expect(useAppWorkflowRecordingLibraryControls).toHaveBeenCalledWith({
      applyDesktopState: mocks.appDesktopStateAppliers.applyAutomationDesktopState,
      setError: input.shellUiState.setError,
      state: input.state,
    });
    expect(createAppNavigationActionsForApp).toHaveBeenCalledWith(
      expect.objectContaining({
        applyCreatedThreadState: mocks.appDesktopStateAppliers.applyCreatedThreadState,
        applyProjectActionState: mocks.appDesktopStateAppliers.applyProjectActionState,
        closeProjectBoard: input.closeProjectBoard,
        setSelectedWorkflowRecordingId: mocks.workflowRecordingLibraryControls.setSelectedWorkflowRecordingId,
      }),
    );
    expect(createAppCredentialDialogActions).toHaveBeenCalledWith(
      expect.objectContaining({
        ambientCliSecretDialog: input.securityPromptState.ambientCliSecretDialog,
        apiKeyDraft: "draft-key",
        provider: "ambient",
        setAmbientCliSecretDialog: input.securityPromptState.setAmbientCliSecretDialog,
        setState: input.setState,
      }),
    );
    expect(createAppPromptHistoryControls).toHaveBeenCalledWith(
      expect.objectContaining({
        draftBeforePromptHistory: "before-history",
        getComposerDraft: input.composerShellState.getComposerDraft,
        promptHistoryCursor: 2,
        setComposerDraft: input.composerShellState.setComposerDraft,
      }),
    );
    expect(useAppChatFindControls).toHaveBeenCalledWith({
      activeThreadId: "thread-1",
      messages: input.state?.messages,
      running: true,
      thinkingDisplayMode: "expanded",
    });
    expect(useAppComposerModelPickerControls).toHaveBeenCalledWith({
      activeThreadId: "thread-1",
      catalogOptions: input.state?.settings.modelCatalog?.selectableMainModelOptions,
      selectedModelId: "kimi",
    });
    expect(createAppPermissionActions).toHaveBeenCalledWith(
      expect.objectContaining({
        permissionAudit: input.securityPromptState.permissionAudit,
        permissionGrants: input.securityPromptState.permissionGrants,
        setPermissionRequests: input.securityPromptState.setPermissionRequests,
        state: input.state,
      }),
    );
    expect(createAppLocalDeepResearchModeControls).toHaveBeenCalledWith(
      expect.objectContaining({
        focusComposerEnd: input.composerShellState.focusComposerEnd,
        localDeepResearchReady: true,
        setContextError: input.workflowRuntimeState.setContextError,
        state: input.state,
      }),
    );

    expect(graph?.activeRunActivityLines).toEqual(["active line"]);
    expect(graph?.appDesktopStateAppliers).toBe(mocks.appDesktopStateAppliers);
    expect(graph?.chatFindControls).toBe(mocks.chatFindControls);
    expect(graph?.composerModelPickerControls).toBe(mocks.composerModelPickerControls);
    expect(graph?.credentialDialogActions).toBe(mocks.credentialDialogActions);
    expect(graph?.localDeepResearchReady).toBe(true);
    expect(graph?.localDeepResearchModeControls).toBe(mocks.localDeepResearchModeControls);
    expect(graph?.navigationActions).toBe(mocks.navigationActions);
    expect(graph?.permissionActions).toBe(mocks.permissionActions);
    expect(graph?.promptHistoryControls).toBe(mocks.promptHistoryControls);
    expect(graph?.running).toBe(true);
    expect(graph?.thinkingDisplayMode).toBe("expanded");
    expect(graph?.workflowRecordingLibraryControls).toBe(mocks.workflowRecordingLibraryControls);
  });
});

function createInput(): AppInteractionGraphForAppInput {
  for (const mock of Object.values(mocks)) {
    if (typeof mock === "function") mock.mockClear();
  }
  mocks.createAppDesktopStateMemoryControls.mockReturnValue({
    rememberClearedGoal: vi.fn(),
    rememberCommittedDesktopState: vi.fn(),
    rememberDesktopState: vi.fn((next) => next),
  });
  mocks.createAppDesktopStateAppliers.mockReturnValue(mocks.appDesktopStateAppliers);
  mocks.useAppWorkflowRecordingLibraryControls.mockReturnValue(mocks.workflowRecordingLibraryControls);
  mocks.createAppNavigationActionsForApp.mockReturnValue(mocks.navigationActions);
  mocks.createAppCredentialDialogActions.mockReturnValue(mocks.credentialDialogActions);
  mocks.createAppPromptHistoryControls.mockReturnValue(mocks.promptHistoryControls);
  mocks.useAppChatFindControls.mockReturnValue(mocks.chatFindControls);
  mocks.useAppComposerModelPickerControls.mockReturnValue(mocks.composerModelPickerControls);
  mocks.createAppPermissionActions.mockReturnValue(mocks.permissionActions);
  mocks.createAppLocalDeepResearchModeControls.mockReturnValue(mocks.localDeepResearchModeControls);

  const state = {
    activeThreadId: "thread-1",
    activeWorkspace: { path: "/repo/active" },
    messages: [{ id: "message-1", role: "assistant", text: "hello" }],
    provider: "ambient",
    settings: {
      model: "kimi",
      modelCatalog: {
        selectableMainModelOptions: [{ id: "kimi", label: "Kimi" }],
      },
      thinkingDisplay: { mode: "expanded" },
    },
  } as unknown as DesktopState;

  return {
    automationShellState: {},
    closeProjectBoard: vi.fn(),
    composerShellState: {
      focusComposerEnd: vi.fn(),
      getComposerDraft: vi.fn(() => "draft"),
      setComposerDraft: vi.fn(),
    },
    projectShellState: {},
    providerRuntimeState: {
      localDeepResearchSetup: { status: "success", result: { setupStatus: "ready" } },
      setSttDraftMetadata: vi.fn(),
    },
    rightPanelState: {},
    runActivityState: {
      runActivityLinesByThread: { "thread-1": ["active line"] },
      runStatus: "running",
      setRunStatus: vi.fn(),
      setThreadRunStatuses: vi.fn(),
      threadRunStatuses: { "thread-1": "running" },
    },
    securityPromptState: {
      ambientCliSecretDialog: { capabilityId: "capability-1", status: "idle" },
      ambientCliSecretInputRef: { current: null },
      apiKeyDraft: "draft-key",
      apiKeyInputRef: { current: null },
      permissionAudit: { entries: [] },
      permissionGrants: [],
      setAmbientCliSecretDialog: vi.fn(),
      setApiDialogOpen: vi.fn(),
      setApiKeyBusy: vi.fn(),
      setApiKeyDraft: vi.fn(),
      setApiKeyStatus: vi.fn(),
      setClipboardCandidate: vi.fn(),
      setPermissionAudit: vi.fn(),
      setPermissionAuditError: vi.fn(),
      setPermissionGrantError: vi.fn(),
      setPermissionGrantRevoking: vi.fn(),
      setPermissionGrants: vi.fn(),
      setPermissionRequests: vi.fn(),
      setPrivilegedCredentialRequests: vi.fn(),
      setSecureInputRequests: vi.fn(),
    },
    setState: vi.fn(),
    shellUiState: {
      setError: vi.fn(),
      setSidebarArea: vi.fn(),
    },
    state,
    workflowRuntimeState: {
      clearedGoalKeysRef: { current: new Set<string>() },
      draftBeforePromptHistory: "before-history",
      goalCompletionCelebrationTimerRef: { current: undefined },
      latestDesktopStateRevisionRef: { current: undefined },
      localDeepResearchModeArmedRef: { current: false },
      promptHistoryCursor: 2,
      promptHistoryRef: { current: ["one", "two"] },
      setContextError: vi.fn(),
      setDraftBeforePromptHistory: vi.fn(),
      setGoalCompletionCelebrationId: vi.fn(),
      setGoalModeArmed: vi.fn(),
      setLocalDeepResearchBudgetOverride: vi.fn(),
      setLocalDeepResearchModeArmedState: vi.fn(),
      setPromptHistoryCursor: vi.fn(),
      setSymphonyBuilderDraft: vi.fn(),
    },
    workspaceShellState: {
      activeProjectRootRef: { current: "/repo" },
      activeThreadIdRef: { current: "thread-1" },
      setWorkspaceRevision: vi.fn(),
      workspaceProjectAliasesRef: { current: {} },
    },
  } as unknown as AppInteractionGraphForAppInput;
}
