import { writeFile } from "node:fs/promises";
import { clipboard } from "electron";
import {
  discoverPiExtensionSandboxPackages,
  installPiExtensionSandboxPackage,
  previewPiExtensionSandboxInstall,
  uninstallPiExtensionSandboxPackage,
} from "./agent-runtime/pi-package-tools/piExtensionSandboxPackages";
import {
  disablePiPrivilegedPackage,
  discoverPiPrivilegedPackages,
  installPiPrivilegedPackage,
  uninstallPiPrivilegedPackage,
} from "./agent-runtime/pi-package-tools/piPrivilegedPackages";
import { discoverCapabilityBuilderHistory } from "./capability-builder/capabilityBuilderMainContract";
import {
  ambientMcpInstallPreview,
  probeAmbientMcpContainerRuntimeStatus,
  uninstallMcpServerForDesktop,
} from "./mcp/mcpDesktopInstallService";
import {
  clearAgentMemory,
  disableAgentMemoryStarter,
  enableAgentMemoryStarter,
  repairAgentMemoryStarter,
  runAgentMemoryEmbeddingLifecycleAction,
} from "./memory/agentMemoryDesktopService";
import { readAutoDispatchStatus, setAutoDispatchEnabled } from "./orchestration/orchestrationAutoDispatchService";
import { prepareAndRecordNextOrchestrationRuns } from "./orchestration/orchestrationDispatch";
import { startPreparedOrchestrationRun } from "./orchestration/orchestrationRunner";
import {
  repairProjectBoardWorkflow,
  updateProjectBoardWorkflowRaw,
  updateProjectBoardWorkflowSettings,
} from "./project-board/projectBoardWorkflowBootstrap";
import { saveSttTestAudio } from "./stt/sttTestAudio";
import { collectVoiceOnboardingHostFacts } from "./voice/voiceOnboardingHostFacts";
import {
  readWorkflowDashboard,
  readWorkflowRunDetail,
  updateWorkflowArtifactSource,
  updateWorkflowConnectorGrant,
} from "./workflow/workflowDashboard";
import {
  buildWorkflowDebugRewritePromptSection,
  createWorkflowDebugRewriteRevision,
  workflowDebugRewriteUserRequest,
} from "./workflow/workflowDebugRewrite";
import { invokeWorkflowNativeTool } from "./workflow/workflowNativeTools";
import { recordWorkflowRevisionDecisionInChat } from "./workflow/workflowRevisionDecisionChat";
import { restoreWorkflowVersion } from "./workflow/workflowVersionRestore";
import {
  describeWorkflowDiscoveryCapability,
  searchWorkflowDiscoveryCapabilities,
} from "./workflow-discovery/workflowDiscoveryCapabilitySearch";
import {
  answerWorkflowDiscoveryQuestion,
  resolveWorkflowDiscoveryAccessRequest,
  startWorkflowDiscovery,
  startWorkflowRevisionDiscovery,
} from "./workflow-discovery/workflowDiscoveryService";
import {
  describeWorkspaceAbsoluteContextPaths,
  describeWorkspaceContextReferences,
  getWorkspaceDiff,
  listWorkspaceFiles,
  resolveWorkspacePathForOpen,
} from "./workspace/workspaceFiles";
import { createGitBranch, discardGitFile, fetchGit, pullGit, pushGit } from "./workspace/workspaceGit";
import { permanentWorktreeBranchName, workflowAgentControlThread } from "./project-runtime/projectRuntimeIpcContextService";
import { AMBIENT_KEYS_URL } from "../shared/ambientUrls";
import { clearPiExtensionSandboxHistory } from "./agent-runtime/pi-package-tools/piExtensionSandboxPackages";
import { clearPiPrivilegedPackageHistory, scanPiPrivilegedPackage } from "./agent-runtime/pi-package-tools/piPrivilegedPackages";
import { saveAmbientCliPackageEnvSecret } from "./ambient-cli/ambientCliPackages";
import { saveCapabilityBuilderEnvSecret } from "./capability-builder/capabilityBuilderMainContract";
import {
  buildContainerRuntimeInstallPlanFromProbe,
  launchContainerRuntimeInstallAction,
} from "./container-runtime/containerRuntimeInstallLauncher";
import { executeContainerRuntimeManagedInstallAction } from "./container-runtime/containerRuntimeManagedInstaller";
import {
  previewContainerRuntimeLifecycleAction,
  runContainerRuntimeLifecycleAction,
} from "./container-runtime/containerRuntimeLifecycleService";
import { writeContainerRuntimeLifecycleRedactedLog } from "./container-runtime/containerRuntimeLifecycleLogs";
import { probeContainerRuntime } from "./container-runtime/containerRuntimeProbeService";
import { recordContainerRuntimeDeferred, recordContainerRuntimeInstallLaunched } from "./container-runtime/containerRuntimeSetupState";
import { createChatExportBundle } from "./chat-export/chatExport";
import { getAppLogs } from "./diagnostics/appLogs";
import { createDiagnosticBundle } from "./diagnostics/diagnostics";
import { importDiagnosticBundleFromFile } from "./diagnostics/diagnosticBundleImport";
import { listWorkspaceOpenTargets, openWorkspaceTarget } from "./desktop-shell/externalEditors";
import { createPermanentWorktree } from "./git/gitWorktrees";
import { restoreLatestGitCheckpoint } from "./git/gitCheckpoints";
import {
  acceptMcpToolDescriptorReviewForDesktop,
  installMcpDefaultCapabilityForDesktop,
  installMcpRegistryServerForDesktop,
  mcpContainerRuntimeSetupStatePath,
} from "./mcp/mcpDesktopInstallService";
import { saveMcpServerEnvSecret } from "./mcp/mcpSecretReferences";
import { classifyToolPermission } from "./permissions/permissionPolicy";
import { createPrivilegedActionAdapter, privilegedActionAdapterSelectionFromEnv } from "./privileged-action/privilegedActionAdapter";
import { writeContainerRuntimeManagedInstallRedactedLog, writePrivilegedActionRedactedLog } from "./privileged-action/privilegedActionLogs";
import { codexPluginTrustFingerprint } from "./plugins/pluginHost";
import { clearSavedAmbientApiKey, saveAmbientApiKey, testAmbientApiKey } from "./security/credentialStore";
import { resolveSubagentApprovalDecision } from "./subagents/subagentApprovalDecision";
import {
  parseThreadPermissionModeChange,
  parseThreadSettingsUpdate,
  permissionModeChangeAuditDetail,
} from "./thread/threadSettingsAuthority";
import { listManagedDevServers, stopManagedDevServer } from "./tool-runtime/toolRuntimeMainContract";
import { createWorkflowSampleArtifact, resolveWorkflowApproval, revalidateWorkflowArtifact } from "./workflow/workflowDashboard";
import { AmbientWorkflowLabJudgeProvider, runWorkflowLab } from "./workflow/workflowLab";
import { archiveProjectChats } from "./workspace/projectRegistry";
import {
  commitGit,
  createPullRequestUrl,
  initializeGitRepository,
  stageAllGitFiles,
  stageGitFile,
  switchWorkspaceBranch,
  unstageAllGitFiles,
  unstageGitFile,
} from "./workspace/workspaceGit";
import type { RegisterMainIpcDependencies } from "./ipc/registerMainIpc";

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
  | "previewContainerRuntimeLifecycleAction"
  | "probeContainerRuntime"
  | "recordContainerRuntimeDeferred"
  | "recordContainerRuntimeInstallLaunched"
  | "resolveSubagentApprovalDecision"
  | "resolveWorkflowApproval"
  | "restoreLatestGitCheckpoint"
  | "revalidateWorkflowArtifact"
  | "runWorkflowLab"
  | "runContainerRuntimeLifecycleAction"
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
  | "writeContainerRuntimeLifecycleRedactedLog"
  | "ambientMcpInstallPreview"
  | "answerWorkflowDiscoveryQuestion"
  | "buildWorkflowDebugRewritePromptSection"
  | "clearAgentMemory"
  | "disableAgentMemoryStarter"
  | "enableAgentMemoryStarter"
  | "repairAgentMemoryStarter"
  | "runAgentMemoryEmbeddingLifecycleAction"
  | "clipboard"
  | "collectVoiceOnboardingHostFacts"
  | "createGitBranch"
  | "createWorkflowDebugRewriteRevision"
  | "describeWorkflowDiscoveryCapability"
  | "describeWorkspaceAbsoluteContextPaths"
  | "describeWorkspaceContextReferences"
  | "disablePiPrivilegedPackage"
  | "discardGitFile"
  | "discoverCapabilityBuilderHistory"
  | "discoverPiExtensionSandboxPackages"
  | "discoverPiPrivilegedPackages"
  | "fetchGit"
  | "getWorkspaceDiff"
  | "installPiExtensionSandboxPackage"
  | "installPiPrivilegedPackage"
  | "invokeWorkflowNativeTool"
  | "listWorkspaceFiles"
  | "permanentWorktreeBranchName"
  | "prepareAndRecordNextOrchestrationRuns"
  | "previewPiExtensionSandboxInstall"
  | "probeAmbientMcpContainerRuntimeStatus"
  | "pullGit"
  | "pushGit"
  | "readAutoDispatchStatus"
  | "readWorkflowDashboard"
  | "readWorkflowRunDetail"
  | "recordWorkflowRevisionDecisionInChat"
  | "repairProjectBoardWorkflow"
  | "resolveWorkflowDiscoveryAccessRequest"
  | "resolveWorkspacePathForOpen"
  | "restoreWorkflowVersion"
  | "saveSttTestAudio"
  | "searchWorkflowDiscoveryCapabilities"
  | "setAutoDispatchEnabled"
  | "startPreparedOrchestrationRun"
  | "startWorkflowDiscovery"
  | "startWorkflowRevisionDiscovery"
  | "uninstallMcpServerForDesktop"
  | "uninstallPiExtensionSandboxPackage"
  | "uninstallPiPrivilegedPackage"
  | "updateProjectBoardWorkflowRaw"
  | "updateProjectBoardWorkflowSettings"
  | "updateWorkflowArtifactSource"
  | "updateWorkflowConnectorGrant"
  | "workflowAgentControlThread"
  | "workflowDebugRewriteUserRequest"
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
  previewContainerRuntimeLifecycleAction,
  probeContainerRuntime,
  recordContainerRuntimeDeferred,
  recordContainerRuntimeInstallLaunched,
  resolveSubagentApprovalDecision,
  resolveWorkflowApproval,
  restoreLatestGitCheckpoint,
  revalidateWorkflowArtifact,
  runContainerRuntimeLifecycleAction,
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
  writeContainerRuntimeLifecycleRedactedLog,
  ambientMcpInstallPreview,
  answerWorkflowDiscoveryQuestion,
  buildWorkflowDebugRewritePromptSection,
  clearAgentMemory,
  disableAgentMemoryStarter,
  enableAgentMemoryStarter,
  repairAgentMemoryStarter,
  runAgentMemoryEmbeddingLifecycleAction,
  clipboard,
  collectVoiceOnboardingHostFacts,
  createGitBranch,
  createWorkflowDebugRewriteRevision,
  describeWorkflowDiscoveryCapability,
  describeWorkspaceAbsoluteContextPaths,
  describeWorkspaceContextReferences,
  disablePiPrivilegedPackage,
  discardGitFile,
  discoverCapabilityBuilderHistory,
  discoverPiExtensionSandboxPackages,
  discoverPiPrivilegedPackages,
  fetchGit,
  getWorkspaceDiff,
  installPiExtensionSandboxPackage,
  installPiPrivilegedPackage,
  invokeWorkflowNativeTool,
  listWorkspaceFiles,
  permanentWorktreeBranchName,
  prepareAndRecordNextOrchestrationRuns,
  previewPiExtensionSandboxInstall,
  probeAmbientMcpContainerRuntimeStatus,
  pullGit,
  pushGit,
  readAutoDispatchStatus,
  readWorkflowDashboard,
  readWorkflowRunDetail,
  recordWorkflowRevisionDecisionInChat,
  repairProjectBoardWorkflow,
  resolveWorkflowDiscoveryAccessRequest,
  resolveWorkspacePathForOpen,
  restoreWorkflowVersion,
  saveSttTestAudio,
  searchWorkflowDiscoveryCapabilities,
  setAutoDispatchEnabled,
  startPreparedOrchestrationRun,
  startWorkflowDiscovery,
  startWorkflowRevisionDiscovery,
  uninstallMcpServerForDesktop,
  uninstallPiExtensionSandboxPackage,
  uninstallPiPrivilegedPackage,
  updateProjectBoardWorkflowRaw,
  updateProjectBoardWorkflowSettings,
  updateWorkflowArtifactSource,
  updateWorkflowConnectorGrant,
  workflowAgentControlThread,
  workflowDebugRewriteUserRequest,
  writeFile,
  writePrivilegedActionRedactedLog,
} satisfies Pick<RegisterMainIpcDependencies, MainIpcStaticDependencyKey>;
