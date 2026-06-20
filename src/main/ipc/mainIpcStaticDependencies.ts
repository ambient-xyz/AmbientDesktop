import { writeFile } from "node:fs/promises";
import { AMBIENT_KEYS_URL } from "../../shared/ambientUrls";
import { clearPiExtensionSandboxHistory } from "../agent-runtime/pi-package-tools/piExtensionSandboxPackages";
import {
  clearPiPrivilegedPackageHistory,
  scanPiPrivilegedPackage,
} from "../agent-runtime/pi-package-tools/piPrivilegedPackages";
import { saveAmbientCliPackageEnvSecret } from "../ambient-cli/ambientCliPackages";
import { saveCapabilityBuilderEnvSecret } from "../capability-builder/capabilityBuilderMainContract";
import {
  buildContainerRuntimeInstallPlanFromProbe,
  launchContainerRuntimeInstallAction,
} from "../container-runtime/containerRuntimeInstallLauncher";
import { executeContainerRuntimeManagedInstallAction } from "../container-runtime/containerRuntimeManagedInstaller";
import { probeContainerRuntime } from "../container-runtime/containerRuntimeProbeService";
import {
  recordContainerRuntimeDeferred,
  recordContainerRuntimeInstallLaunched,
} from "../container-runtime/containerRuntimeSetupState";
import { createChatExportBundle } from "../chat-export/chatExport";
import { getAppLogs } from "../diagnostics/appLogs";
import { createDiagnosticBundle } from "../diagnostics/diagnostics";
import { importDiagnosticBundleFromFile } from "../diagnostics/diagnosticBundleImport";
import { listWorkspaceOpenTargets, openWorkspaceTarget } from "../desktop-shell/externalEditors";
import { createPermanentWorktree } from "../git/gitWorktrees";
import { restoreLatestGitCheckpoint } from "../git/gitCheckpoints";
import {
  acceptMcpToolDescriptorReviewForDesktop,
  installMcpDefaultCapabilityForDesktop,
  installMcpRegistryServerForDesktop,
  mcpContainerRuntimeSetupStatePath,
} from "../mcp/mcpDesktopInstallService";
import { saveMcpServerEnvSecret } from "../mcp/mcpSecretReferences";
import { classifyToolPermission } from "../permissions/permissionPolicy";
import { createPrivilegedActionAdapter, privilegedActionAdapterSelectionFromEnv } from "../privileged-action/privilegedActionAdapter";
import {
  writeContainerRuntimeManagedInstallRedactedLog,
  writePrivilegedActionRedactedLog,
} from "../privileged-action/privilegedActionLogs";
import { codexPluginTrustFingerprint } from "../plugins/pluginHost";
import {
  clearSavedAmbientApiKey,
  saveAmbientApiKey,
  testAmbientApiKey,
} from "../security/credentialStore";
import { resolveSubagentApprovalDecision } from "../subagents/subagentApprovalDecision";
import {
  parseThreadPermissionModeChange,
  parseThreadSettingsUpdate,
  permissionModeChangeAuditDetail,
} from "../thread/threadSettingsAuthority";
import { listManagedDevServers, stopManagedDevServer } from "../tool-runtime/toolRuntimeMainContract";
import {
  createWorkflowSampleArtifact,
  resolveWorkflowApproval,
  revalidateWorkflowArtifact,
} from "../workflow/workflowDashboard";
import { AmbientWorkflowLabJudgeProvider, runWorkflowLab } from "../workflow/workflowLab";
import { archiveProjectChats } from "../workspace/projectRegistry";
import {
  commitGit,
  createPullRequestUrl,
  initializeGitRepository,
  stageAllGitFiles,
  stageGitFile,
  switchWorkspaceBranch,
  unstageAllGitFiles,
  unstageGitFile,
} from "../workspace/workspaceGit";
import type { RegisterMainIpcDependencies } from "./registerMainIpc";

type MainIpcStaticDependencyKey =
  | "AMBIENT_KEYS_URL"
  | "AmbientWorkflowLabJudgeProvider"
  | "acceptMcpToolDescriptorReviewForDesktop"
  | "archiveProjectChats"
  | "buildContainerRuntimeInstallPlanFromProbe"
  | "classifyToolPermission"
  | "clearPiExtensionSandboxHistory"
  | "clearPiPrivilegedPackageHistory"
  | "clearSavedAmbientApiKey"
  | "codexPluginTrustFingerprint"
  | "commitGit"
  | "createChatExportBundle"
  | "createDiagnosticBundle"
  | "createPermanentWorktree"
  | "createPrivilegedActionAdapter"
  | "createPullRequestUrl"
  | "createWorkflowSampleArtifact"
  | "executeContainerRuntimeManagedInstallAction"
  | "getAppLogs"
  | "importDiagnosticBundleFromFile"
  | "initializeGitRepository"
  | "installMcpDefaultCapabilityForDesktop"
  | "installMcpRegistryServerForDesktop"
  | "launchContainerRuntimeInstallAction"
  | "listManagedDevServers"
  | "listWorkspaceOpenTargets"
  | "mcpContainerRuntimeSetupStatePath"
  | "openWorkspaceTarget"
  | "parseThreadPermissionModeChange"
  | "parseThreadSettingsUpdate"
  | "permissionModeChangeAuditDetail"
  | "privilegedActionAdapterSelectionFromEnv"
  | "probeContainerRuntime"
  | "recordContainerRuntimeDeferred"
  | "recordContainerRuntimeInstallLaunched"
  | "resolveSubagentApprovalDecision"
  | "resolveWorkflowApproval"
  | "restoreLatestGitCheckpoint"
  | "revalidateWorkflowArtifact"
  | "runWorkflowLab"
  | "saveAmbientApiKey"
  | "saveAmbientCliPackageEnvSecret"
  | "saveCapabilityBuilderEnvSecret"
  | "saveMcpServerEnvSecret"
  | "scanPiPrivilegedPackage"
  | "stageAllGitFiles"
  | "stageGitFile"
  | "stopManagedDevServer"
  | "switchWorkspaceBranch"
  | "testAmbientApiKey"
  | "unstageAllGitFiles"
  | "unstageGitFile"
  | "writeContainerRuntimeManagedInstallRedactedLog"
  | "writeFile"
  | "writePrivilegedActionRedactedLog";

export const mainIpcStaticDependencies = {
  AMBIENT_KEYS_URL,
  AmbientWorkflowLabJudgeProvider,
  acceptMcpToolDescriptorReviewForDesktop,
  archiveProjectChats,
  buildContainerRuntimeInstallPlanFromProbe,
  classifyToolPermission,
  clearPiExtensionSandboxHistory,
  clearPiPrivilegedPackageHistory,
  clearSavedAmbientApiKey,
  codexPluginTrustFingerprint,
  commitGit,
  createChatExportBundle,
  createDiagnosticBundle,
  createPermanentWorktree,
  createPrivilegedActionAdapter,
  createPullRequestUrl,
  createWorkflowSampleArtifact,
  executeContainerRuntimeManagedInstallAction,
  getAppLogs,
  importDiagnosticBundleFromFile,
  initializeGitRepository,
  installMcpDefaultCapabilityForDesktop,
  installMcpRegistryServerForDesktop,
  launchContainerRuntimeInstallAction,
  listManagedDevServers,
  listWorkspaceOpenTargets,
  mcpContainerRuntimeSetupStatePath,
  openWorkspaceTarget,
  parseThreadPermissionModeChange,
  parseThreadSettingsUpdate,
  permissionModeChangeAuditDetail,
  privilegedActionAdapterSelectionFromEnv,
  probeContainerRuntime,
  recordContainerRuntimeDeferred,
  recordContainerRuntimeInstallLaunched,
  resolveSubagentApprovalDecision,
  resolveWorkflowApproval,
  restoreLatestGitCheckpoint,
  revalidateWorkflowArtifact,
  runWorkflowLab,
  saveAmbientApiKey,
  saveAmbientCliPackageEnvSecret,
  saveCapabilityBuilderEnvSecret,
  saveMcpServerEnvSecret,
  scanPiPrivilegedPackage,
  stageAllGitFiles,
  stageGitFile,
  stopManagedDevServer,
  switchWorkspaceBranch,
  testAmbientApiKey,
  unstageAllGitFiles,
  unstageGitFile,
  writeContainerRuntimeManagedInstallRedactedLog,
  writeFile,
  writePrivilegedActionRedactedLog,
} satisfies Pick<RegisterMainIpcDependencies, MainIpcStaticDependencyKey>;
