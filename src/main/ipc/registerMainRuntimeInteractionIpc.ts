import type { IpcMainInvokeEvent } from "electron";

import type { DesktopEvent } from "../../shared/desktopTypes";
import {
  registerAmbientCliSecretDomainIpc,
  type RegisterAmbientCliSecretDomainIpcDependencies,
} from "./registerAmbientCliSecretDomainIpc";
import {
  registerApprovalDomainIpc,
  type ApprovalDomainHost,
  type RegisterApprovalDomainIpcDependencies,
} from "./registerApprovalDomainIpc";
import {
  registerChatRuntimeDomainIpc,
  type ChatRuntimeDomainHost,
  type RegisterChatRuntimeDomainIpcDependencies,
} from "./registerChatRuntimeDomainIpc";
import {
  registerDiagnosticsExportDomainIpc,
  type DiagnosticsExportRuntimeHost,
  type RegisterDiagnosticsExportDomainIpcDependencies,
} from "./registerDiagnosticsExportDomainIpc";
import type { ProjectStore } from "./ipcProjectStoreFacade";
import {
  registerPermissionSecurityDomainIpc,
  type PermissionSecurityDomainHost,
  type RegisterPermissionSecurityDomainIpcDependencies,
} from "./registerPermissionSecurityDomainIpc";
import {
  describeSlashCommandForProjectHost,
  registerSlashCommandIpc,
  type RegisterSlashCommandIpcDependencies,
} from "./registerSlashCommandIpc";
import type { ProjectRuntimeHost as ProjectRuntimeHostContract } from "./ipcProjectRuntimeFacade";
import {
  registerTerminalDomainIpc,
  type RegisterTerminalDomainIpcDependencies,
  type TerminalDomainRuntimeHost,
} from "./registerTerminalDomainIpc";
import { assertSlashCommandSelectionInvocable } from "./slashCommandCatalog";

type MainRuntimeInteractionHost = ProjectRuntimeHostContract<ProjectStore> &
  ApprovalDomainHost<ProjectStore> &
  ChatRuntimeDomainHost<ProjectStore> &
  DiagnosticsExportRuntimeHost<ProjectStore> &
  PermissionSecurityDomainHost &
  TerminalDomainRuntimeHost;

type DesktopEventEmitterWindow = {
  webContents: {
    send(channel: "desktop:event", event: DesktopEvent): void;
  };
};

type MainRuntimeInteractionIpcDependencies<
  Host extends MainRuntimeInteractionHost = MainRuntimeInteractionHost,
> = Omit<
  RegisterApprovalDomainIpcDependencies<ProjectStore, Host>,
  "getFeatureFlagSnapshot"
> &
  RegisterDiagnosticsExportDomainIpcDependencies<Host, Host> &
  RegisterPermissionSecurityDomainIpcDependencies<Host> &
  RegisterAmbientCliSecretDomainIpcDependencies &
  Omit<RegisterSlashCommandIpcDependencies<Host>, "getFeatureFlagSnapshot"> &
  Omit<RegisterTerminalDomainIpcDependencies<Host>, "assertTrustedTerminalIpc"> &
  Omit<
    RegisterChatRuntimeDomainIpcDependencies<Host>,
    "emitDesktopEvent" | "validateSlashCommandSelection"
  > & {
    assertTrustedMainWindowIpc(event: IpcMainInvokeEvent): void;
    currentFeatureFlagSnapshot: RegisterApprovalDomainIpcDependencies<
      ProjectStore,
      Host
    >["getFeatureFlagSnapshot"];
    mainWindow: DesktopEventEmitterWindow | null;
  };

export function registerMainRuntimeInteractionIpc(
  deps: Record<string, unknown>,
): void {
  const {
    activeHost,
    activeThreadId,
    activeThreadIdForHost,
    activeWorkspaceFileContextForProjectHost,
    app,
    assertTrustedMainWindowIpc,
    classifyToolPermission,
    createChatExportBundle,
    createChatPdfExport,
    createDiagnosticBundle,
    createMainDiagnosticSource,
    currentFeatureFlagSnapshot,
    describeWorkspaceContextReferences,
    dialog,
    discoverAmbientCliPackages,
    emitPermissionAuditCreated,
    emitPermissionGrantCreated,
    emitPermissionGrantRevoked,
    emitProjectScopedEvent,
    emitProjectStateIfActive,
    emitThreadUpdated,
    emitWorkflowUpdated,
    existsSync,
    getAppLogs,
    handleIpc,
    importDiagnosticBundleFromFile,
    isActiveProjectRuntimeHost,
    join,
    listGlobalWorkflowRecordingLibrary,
    mainWindow,
    permissionGrantWorkspacePath,
    permissions,
    prepareWorktreeForThread,
    privilegedCredentials,
    projectRuntimeHostForTerminal,
    projectRuntimeHostForWorkspacePath,
    readCodexPluginCatalog,
    requestPermissionWithGrantRegistry,
    requireActiveProjectRuntimeHost,
    requireProjectRuntimeHostForPermissionGrant,
    requireProjectRuntimeHostForPermissionGrantInput,
    requireProjectRuntimeHostForSubagentRun,
    requireProjectRuntimeHostForSubagentWaitBarrier,
    requireProjectRuntimeHostForThread,
    requireProjectRuntimeHostForThreadAction,
    requireProjectRuntimeHostForWorkflowRecording,
    requireProjectRuntimeHostForWorkflowRun,
    resolveCanonicalLocalFilePath,
    localPathVisibleToThread,
    localPathInsideActiveWorkspace,
    resolveSubagentApprovalDecision,
    resolveWorkflowApproval,
    saveAmbientCliPackageEnvSecret,
    saveCapabilityBuilderEnvSecret,
    saveMcpServerEnvSecret,
    secureInputs,
    selectAmbientCliPackageForSecret,
    setProjectHostActiveThreadId,
    terminalStartTokens,
    writeFile,
  } = deps as unknown as MainRuntimeInteractionIpcDependencies;

  registerApprovalDomainIpc<ProjectStore, MainRuntimeInteractionHost>({
    emitProjectScopedEvent,
    emitProjectStateIfActive,
    emitWorkflowUpdated,
    getFeatureFlagSnapshot: currentFeatureFlagSnapshot,
    handleIpc,
    requireProjectRuntimeHostForSubagentRun,
    requireProjectRuntimeHostForSubagentWaitBarrier,
    requireProjectRuntimeHostForWorkflowRun,
    resolveSubagentApprovalDecision,
    resolveWorkflowApproval,
  });

  registerDiagnosticsExportDomainIpc<
    MainRuntimeInteractionHost,
    MainRuntimeInteractionHost
  >({
    app,
    createChatExportBundle,
    createChatPdfExport,
    createDiagnosticBundle,
    createMainDiagnosticSource,
    dialog,
    existsSync,
    getAppLogs,
    handleIpc,
    importDiagnosticBundleFromFile,
    join,
    mainWindow,
    requireActiveProjectRuntimeHost,
    requireProjectRuntimeHostForThread,
    requireProjectRuntimeHostForThreadAction,
    writeFile,
  });

  registerPermissionSecurityDomainIpc({
    handleIpc,
    emitPermissionGrantCreated,
    emitPermissionGrantRevoked,
    permissionGrantWorkspacePath,
    permissions,
    privilegedCredentials,
    requireActiveProjectRuntimeHost,
    requireProjectRuntimeHostForPermissionGrant,
    requireProjectRuntimeHostForPermissionGrantInput,
    secureInputs,
  });

  registerAmbientCliSecretDomainIpc({
    activeWorkspaceFileContextForProjectHost,
    discoverAmbientCliPackages,
    handleIpc,
    saveAmbientCliPackageEnvSecret,
    saveCapabilityBuilderEnvSecret,
    saveMcpServerEnvSecret,
    selectAmbientCliPackageForSecret,
  });

  registerSlashCommandIpc<MainRuntimeInteractionHost>({
    handleIpc,
    getFeatureFlagSnapshot: currentFeatureFlagSnapshot,
    listGlobalWorkflowRecordingLibrary,
    readCodexPluginCatalog,
    requireActiveProjectRuntimeHost,
    requireProjectRuntimeHostForWorkflowRecording,
  });

  registerTerminalDomainIpc<MainRuntimeInteractionHost>({
    handleIpc,
    activeThreadIdForHost,
    assertTrustedTerminalIpc: (event) => assertTrustedMainWindowIpc(event),
    classifyToolPermission,
    emitPermissionAuditCreated,
    isActiveProjectRuntimeHost,
    projectRuntimeHostForTerminal,
    projectRuntimeHostForWorkspacePath,
    requestPermissionWithGrantRegistry,
    requireProjectRuntimeHostForThread,
    terminalStartTokens,
  });

  registerChatRuntimeDomainIpc<MainRuntimeInteractionHost>({
    activeHost,
    activeThreadId,
    activeThreadIdForHost,
    describeWorkspaceContextReferences,
    resolveCanonicalLocalFilePath,
    localPathVisibleToThread,
    localPathInsideActiveWorkspace,
    emitDesktopEvent: (event) =>
      mainWindow?.webContents.send("desktop:event", event),
    emitProjectScopedEvent,
    emitProjectStateIfActive,
    emitThreadUpdated,
    handleIpc,
    isActiveProjectRuntimeHost,
    prepareWorktreeForThread,
    requireProjectRuntimeHostForThread,
    setProjectHostActiveThreadId,
    validateSlashCommandSelection: async (host, selection) => {
      const description = await describeSlashCommandForProjectHost(
        host,
        { entryId: selection.entryId, includeUnavailable: true },
        {
          requireProjectRuntimeHostForWorkflowRecording,
          readCodexPluginCatalog,
          listGlobalWorkflowRecordingLibrary,
          getFeatureFlagSnapshot: currentFeatureFlagSnapshot,
        },
      );
      assertSlashCommandSelectionInvocable(selection, description);
    },
  });
}
