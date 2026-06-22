import type { ExtensionFactory, AgentToolResult } from "@mariozechner/pi-coding-agent";

import type { DesktopEvent } from "../../shared/desktopTypes";
import type { PermissionPromptResolution, PermissionRequest } from "../../shared/permissionTypes";
import type { ThreadSummary } from "../../shared/threadTypes";
import type { WorkspaceState } from "../../shared/workspaceTypes";
import type { AgentRuntimeFeatures } from "./agentRuntimeFeatures";
import {
  recordTransientFileAuthorityForAllowedTool,
  recordTransientFileAuthorityFromPermissionRequest,
  type MutableTransientFileAuthorityRootStore,
} from "./agentRuntimeFileAuthority";
import type { AgentRuntimeFileAuthorityController } from "./agentRuntimeFileAuthorityController";
import type { AgentRuntimeInstallRouteGuard } from "./agentRuntimeInstallRouteGuard";
import {
  createInterruptedToolCallRecoveryToolExtension as createInterruptedToolCallRecoveryToolsExtension,
  readInterruptedToolCallRecoveryArtifact as readInterruptedToolCallRecoveryArtifactFromRoots,
} from "./agentRuntimeInterruptedRecoveryTools";
import type { AmbientFileAuthorityRequest } from "./agentRuntimePiFacade";
import { permissionPolicyFileToolAccess, permissionPolicyPathForTool, resolvePolicyPath } from "./agentRuntimePermissionsFacade";
import { createPermissionGateExtension as createPermissionGateToolsExtension } from "./agentRuntimePermissionGateExtension";
import {
  permissionToolInput as resolvePermissionToolInput,
  type AgentRuntimePermissionToolInputDependencies,
} from "./agentRuntimePermissionToolInput";
import type { ProjectStore } from "./agentRuntimeProjectStoreFacade";
import type { RuntimePermissionWaitControl, RuntimePermissionWaitStart } from "./runtimePermissionWaitController";
import { resolveAgentRuntimeToolCallPermission } from "./tools/agentRuntimeToolCallPermission";

export interface AgentRuntimeToolPermissionControllerOptions {
  activeRunId: (threadId: string) => string | undefined;
  browserCredentials: AgentRuntimePermissionToolInputDependencies["browserCredentials"];
  fileAuthority: AgentRuntimeFileAuthorityController;
  googleWorkspace: AgentRuntimeFeatures["googleWorkspace"];
  installRouteGuard: AgentRuntimeInstallRouteGuard;
  permissionWaitControl: (threadId: string) => RuntimePermissionWaitControl | undefined;
  readBrowserState: AgentRuntimePermissionToolInputDependencies["readBrowserState"];
  readLocalDeepResearchReadiness: AgentRuntimePermissionToolInputDependencies["readLocalDeepResearchReadiness"];
  requestPermission: (
    request: Omit<PermissionRequest, "id">,
    options?: { onRequest?: (request: PermissionRequest) => void },
  ) => Promise<PermissionPromptResolution>;
  store: ProjectStore;
  transientFileAuthorityRoots: MutableTransientFileAuthorityRootStore;
  emit: (event: DesktopEvent) => void;
}

export class AgentRuntimeToolPermissionController {
  constructor(private readonly options: AgentRuntimeToolPermissionControllerOptions) {}

  createPermissionGateExtension(threadId: string, workspace: WorkspaceState): ExtensionFactory {
    return createPermissionGateToolsExtension({
      threadId,
      workspace,
      resolveToolCallPermission: (threadId, workspace, toolName, toolInput) =>
        this.resolveToolCallPermission(threadId, workspace, toolName, toolInput),
    });
  }

  async resolveToolCallPermission(
    threadId: string,
    workspace: WorkspaceState,
    toolName: string,
    rawToolInput: unknown,
  ): Promise<{ reason: string } | undefined> {
    return resolveAgentRuntimeToolCallPermission(threadId, workspace, toolName, rawToolInput, {
      store: this.options.store,
      installRouteGateBlockForTool: (threadId, toolName) => this.options.installRouteGuard.installRouteGateBlockForTool(threadId, toolName),
      mcpInstallShellBlockForTool: (input) => this.options.installRouteGuard.mcpInstallShellBlockForTool(input),
      permissionToolInput: (toolName, toolInput, workspace) =>
        resolvePermissionToolInput(toolName, toolInput, workspace, {
          readLocalDeepResearchReadiness: this.options.readLocalDeepResearchReadiness,
          googleWorkspace: this.options.googleWorkspace,
          browserCredentials: this.options.browserCredentials,
          readBrowserState: this.options.readBrowserState,
        }),
      requestPermission: (request, options) => this.options.requestPermission(request, options),
      beginPermissionWait: (threadId, input) => this.beginPermissionWait(threadId, input),
      activeRunId: (threadId) => this.options.activeRunId(threadId),
      recordTransientFileAuthorityForAllowedTool: (threadId, workspace, toolName, toolInput, reason) =>
        recordTransientFileAuthorityForAllowedTool(
          {
            threadId,
            workspacePath: workspace.path,
            toolName,
            toolInput,
            reason,
          },
          {
            roots: this.options.transientFileAuthorityRoots,
            fileToolAccess: permissionPolicyFileToolAccess,
            pathForTool: permissionPolicyPathForTool,
            resolvePolicyPath,
          },
        ),
      recordTransientFileAuthorityFromPermissionRequest: (threadId, thread, request, reason) =>
        recordTransientFileAuthorityFromPermissionRequest(
          {
            threadId,
            thread,
            projectPath: this.options.store.getWorkspace().path,
            request,
            reason,
          },
          {
            roots: this.options.transientFileAuthorityRoots,
          },
        ),
      emit: (event) => this.options.emit(event),
    });
  }

  createInterruptedToolCallRecoveryToolExtension(threadId: string, workspace: WorkspaceState): ExtensionFactory {
    return createInterruptedToolCallRecoveryToolsExtension({
      workspacePath: workspace.path,
      readAuthorityRootPaths: () => this.fileAuthorityRootPathsForThread(threadId, "read"),
      writeAuthorityRootPaths: () => this.fileAuthorityRootPathsForThread(threadId, "write"),
      includeWorkspaceRootAuthority: () => this.includeWorkspaceRootAuthorityForThread(threadId),
      requestFileAuthority: (request) => this.requestFileAuthorityForThread(threadId, workspace, request),
    });
  }

  readInterruptedToolCallRecoveryArtifact(threadId: string, params: unknown): AgentToolResult<Record<string, unknown>> {
    return readInterruptedToolCallRecoveryArtifactFromRoots(params, {
      authorityRootPaths: this.fileAuthorityRootPathsForThread(threadId, "read"),
    });
  }

  fileAuthorityRootPathsForThread(threadId: string, access: "read" | "write"): string[] {
    return this.options.fileAuthority.rootPathsForThread(threadId, access);
  }

  includeWorkspaceRootAuthorityForThread(threadId: string): boolean {
    return this.options.fileAuthority.includeWorkspaceRootAuthorityForThread(threadId);
  }

  requestFileAuthorityForThread(threadId: string, workspace: WorkspaceState, request: AmbientFileAuthorityRequest): Promise<boolean> {
    return this.options.fileAuthority.requestForThread(threadId, workspace, request);
  }

  childApprovalModeForThread(thread: Pick<ThreadSummary, "kind" | "subagentRunId">): "interactive" | "non_interactive" | undefined {
    return this.options.fileAuthority.childApprovalModeForThread(thread);
  }

  private beginPermissionWait(
    threadId: string,
    input: RuntimePermissionWaitStart,
  ): ReturnType<RuntimePermissionWaitControl["begin"]> | undefined {
    return this.options.permissionWaitControl(threadId)?.begin(input);
  }
}
