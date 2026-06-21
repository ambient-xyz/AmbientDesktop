import {
  registerAppBootstrapDomainIpc,
  type RegisterAppBootstrapDomainIpcDependencies,
} from "./registerAppBootstrapDomainIpc";
import {
  registerLifecycleDomainIpc,
  type RegisterLifecycleDomainIpcDependencies,
} from "./registerLifecycleDomainIpc";
import {
  registerOrchestrationDomainIpc,
  type RegisterOrchestrationDomainIpcDependencies,
} from "./registerOrchestrationDomainIpc";
import {
  registerSettingsDomainIpc,
  type SettingsDomainServices,
} from "./registerSettingsDomainIpc";
import {
  registerWorkflowRecordingLabDomainIpc,
  type RegisterWorkflowRecordingLabDomainIpcDependencies,
} from "./registerWorkflowRecordingLabDomainIpc";

type MainAppCoreIpcDependencies =
  Omit<RegisterAppBootstrapDomainIpcDependencies, "readBootstrapState"> &
  Omit<RegisterOrchestrationDomainIpcDependencies, "openPath"> &
  SettingsDomainServices &
  Omit<
    RegisterLifecycleDomainIpcDependencies,
    "createWorkspaceDirectory" | "showWorkspaceDialog"
  > &
  RegisterWorkflowRecordingLabDomainIpcDependencies & {
    app: {
      isPackaged: boolean;
    };
    currentFeatureFlagSnapshot: RegisterWorkflowRecordingLabDomainIpcDependencies["getFeatureFlagSnapshot"];
    dialog: {
      showOpenDialog(
        window: unknown,
        options: Parameters<
          RegisterLifecycleDomainIpcDependencies["showWorkspaceDialog"]
        >[0],
      ): ReturnType<
        RegisterLifecycleDomainIpcDependencies["showWorkspaceDialog"]
      >;
    };
    mainWindow: unknown;
    mkdirSync(
      path: string,
      options: { recursive: true },
    ): unknown;
    readState: RegisterAppBootstrapDomainIpcDependencies["readBootstrapState"];
    shell: {
      openPath(workspacePath: string): Promise<string> | string;
    };
  };

export function registerMainAppCoreIpc(
  deps: Record<string, unknown>,
): void {
  const mainDeps = deps as unknown as MainAppCoreIpcDependencies;
  const {
    AmbientWorkflowLabJudgeProvider,
    activeThreadIdForHost,
    ambientRetryPolicyFromSettings,
    app,
    currentFeatureFlagSnapshot,
    desktopUpdateService,
    dialog,
    emitOrchestrationUpdated,
    emitProjectScopedEvent,
    emitProjectStateIfActive,
    emitWorkflowRecordingLibraryStateChanged,
    ensureProjectRuntimeHostForWorkspacePath,
    getAmbientProviderStatus,
    handleIpc,
    listGlobalWorkflowRecordingLibrary,
    mainWindow,
    mkdirSync,
    prepareAndRecordNextOrchestrationRuns,
    prepareWorktreeForThread,
    readAutoDispatchStatus,
    readCurrentOrchestrationBoard,
    readOrchestrationWorkflowReadiness,
    readState,
    readStateForProjectHostAction,
    recordActiveProjectBoardExecutionReadinessBlocker,
    repairProjectBoardWorkflow,
    requireActiveProjectRuntimeHost,
    requireProjectRuntimeHostForOrchestrationRun,
    requireProjectRuntimeHostForOrchestrationTask,
    requireProjectRuntimeHostForOrchestrationWorkspace,
    requireProjectRuntimeHostForThread,
    requireProjectRuntimeHostForThreadAction,
    requireProjectRuntimeHostForWorkflowLabRun,
    requireProjectRuntimeHostForWorkflowRecording,
    reviewFinishedProjectBoardRun,
    runWorkflowLab,
    setAutoDispatchEnabled,
    setProjectHostActiveThreadId,
    shell,
    startPreparedOrchestrationRun,
    switchWorkspace,
    updateProjectBoardWorkflowRaw,
    updateProjectBoardWorkflowSettings,
  } = mainDeps;

  registerAppBootstrapDomainIpc({
    handleIpc,
    readBootstrapState: () => readState(),
  });

  registerOrchestrationDomainIpc({
    handleIpc,
    activeThreadIdForHost,
    emitOrchestrationUpdated,
    emitProjectStateIfActive,
    ensureProjectRuntimeHostForWorkspacePath,
    openPath: (workspacePath) => shell.openPath(workspacePath),
    prepareAndRecordNextOrchestrationRuns,
    readAutoDispatchStatus,
    readCurrentOrchestrationBoard,
    readOrchestrationWorkflowReadiness,
    recordActiveProjectBoardExecutionReadinessBlocker,
    repairProjectBoardWorkflow,
    requireActiveProjectRuntimeHost,
    requireProjectRuntimeHostForOrchestrationRun,
    requireProjectRuntimeHostForOrchestrationTask,
    requireProjectRuntimeHostForOrchestrationWorkspace,
    requireProjectRuntimeHostForThread,
    reviewFinishedProjectBoardRun,
    setAutoDispatchEnabled,
    setProjectHostActiveThreadId,
    startPreparedOrchestrationRun,
    updateProjectBoardWorkflowRaw,
    updateProjectBoardWorkflowSettings,
  });

  registerSettingsDomainIpc({
    handleIpc,
    isAppPackaged: () => app.isPackaged,
    settingsServices: mainDeps,
  });

  registerLifecycleDomainIpc({
    handleIpc,
    desktopUpdateService,
    showWorkspaceDialog: (options) =>
      dialog.showOpenDialog(mainWindow, options),
    createWorkspaceDirectory: (workspacePath) =>
      mkdirSync(workspacePath, { recursive: true }),
    switchWorkspace,
    requireActiveProjectRuntimeHost,
    setProjectHostActiveThreadId,
    emitProjectStateIfActive,
    readStateForProjectHostAction,
    requireProjectRuntimeHostForThread,
    emitProjectScopedEvent,
  });

  registerWorkflowRecordingLabDomainIpc({
    AmbientWorkflowLabJudgeProvider,
    ambientRetryPolicyFromSettings,
    getAmbientProviderStatus,
    handleIpc,
    requireActiveProjectRuntimeHost,
    requireProjectRuntimeHostForThreadAction,
    requireProjectRuntimeHostForWorkflowLabRun,
    requireProjectRuntimeHostForWorkflowRecording,
    prepareWorktreeForThread,
    setProjectHostActiveThreadId,
    emitProjectStateIfActive,
    emitWorkflowRecordingLibraryStateChanged,
    readStateForProjectHostAction,
    listGlobalWorkflowRecordingLibrary,
    getFeatureFlagSnapshot: currentFeatureFlagSnapshot,
    runWorkflowLab,
  });
}
