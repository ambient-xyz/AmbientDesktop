
import type { ApprovalDomainHost } from "./registerApprovalDomainIpc";

import { registerE2eDomainIpc } from "./registerE2eDomainIpc";

import type { ChatRuntimeDomainHost } from "./registerChatRuntimeDomainIpc";

import type { PermissionSecurityDomainHost } from "./registerPermissionSecurityDomainIpc";

import type { TerminalDomainRuntimeHost } from "./registerTerminalDomainIpc";

import type { BrowserDomainRuntimeHost } from "./registerBrowserDomainIpc";

import type { RegisterProjectBoardDomainIpcDependencies } from "./registerProjectBoardDomainIpc";

import type { SettingsDomainServices } from "./registerSettingsDomainIpc";

import { registerMainAppCoreIpc } from "./registerMainAppCoreIpc";

import { registerMainPluginToolingIpc } from "./registerMainPluginToolingIpc";

import { registerMainProjectWorkspaceIpc } from "./registerMainProjectWorkspaceIpc";

import { registerMainRuntimeInteractionIpc } from "./registerMainRuntimeInteractionIpc";

import { registerMainShellBrowserIpc } from "./registerMainShellBrowserIpc";

import { registerMainWorkflowAutomationIpc } from "./registerMainWorkflowAutomationIpc";

import type { ProjectRuntimeHost as ProjectRuntimeHostContract } from "./ipcProjectRuntimeFacade";
import type { ProjectStore } from "./ipcProjectStoreFacade";
import { resolvePermissionWithGrants } from "../permissions/permissionGrants";

type ProjectRuntimeHost = ProjectRuntimeHostContract<
  ProjectStore,
  unknown,
  BrowserDomainRuntimeHost["browserService"],
  BrowserDomainRuntimeHost["browserCredentialStore"],
  ApprovalDomainHost<ProjectStore>["runtime"] & ChatRuntimeDomainHost<ProjectStore>["runtime"],
  TerminalDomainRuntimeHost["terminals"],
  { enabled: boolean }
> &
  BrowserDomainRuntimeHost &
  ApprovalDomainHost<ProjectStore> &
  ChatRuntimeDomainHost<ProjectStore> &
  PermissionSecurityDomainHost &
  TerminalDomainRuntimeHost;

type ProjectRuntimeHostLookup<Host extends ProjectRuntimeHost> = (...args: any[]) => Host;

export interface RegisterMainIpcDependencies<Host extends ProjectRuntimeHost = ProjectRuntimeHost> extends SettingsDomainServices, Record<string, any> {
  AmbientWorkflowExplorationProvider: typeof import("./ipcWorkflowFacade").AmbientWorkflowExplorationProvider;
  AmbientWorkflowLabJudgeProvider: typeof import("./ipcWorkflowFacade").AmbientWorkflowLabJudgeProvider;
  runWorkflowLab: typeof import("./ipcWorkflowFacade").runWorkflowLab;
  requireActiveProjectRuntimeHost: ProjectRuntimeHostLookup<Host>;
  requireProjectRuntimeHostForAutomationSchedule: ProjectRuntimeHostLookup<Host>;
  requireProjectRuntimeHostForAutomationScheduleTarget: ProjectRuntimeHostLookup<Host>;
  requireProjectRuntimeHostForAutomationThread: ProjectRuntimeHostLookup<Host>;
  requireProjectRuntimeHostForCallableWorkflowTask: ProjectRuntimeHostLookup<Host>;
  requireProjectRuntimeHostForOrchestrationRun: ProjectRuntimeHostLookup<Host>;
  requireProjectRuntimeHostForOrchestrationTask: ProjectRuntimeHostLookup<Host>;
  requireProjectRuntimeHostForOrchestrationWorkspace: ProjectRuntimeHostLookup<Host>;
  requireProjectRuntimeHostForPermissionGrant: ProjectRuntimeHostLookup<Host>;
  requireProjectRuntimeHostForPermissionGrantInput: ProjectRuntimeHostLookup<Host>;
  requireProjectRuntimeHostForPlannerPlanArtifact: ProjectRuntimeHostLookup<Host>;
  requireProjectRuntimeHostForSubagentRun: ProjectRuntimeHostLookup<Host>;
  requireProjectRuntimeHostForSubagentWaitBarrier: ProjectRuntimeHostLookup<Host>;
  requireProjectRuntimeHostForThread: ProjectRuntimeHostLookup<Host>;
  requireProjectRuntimeHostForThreadAction: ProjectRuntimeHostLookup<Host>;
  requireProjectRuntimeHostForWorkflowArtifact: ProjectRuntimeHostLookup<Host>;
  requireProjectRuntimeHostForWorkflowLabRun: ProjectRuntimeHostLookup<Host>;
  requireProjectRuntimeHostForWorkflowRecording: ProjectRuntimeHostLookup<Host>;
  requireProjectRuntimeHostForWorkflowRevision: ProjectRuntimeHostLookup<Host>;
  requireProjectRuntimeHostForWorkflowRun: ProjectRuntimeHostLookup<Host>;
  requireProjectRuntimeHostForWorkflowThread: ProjectRuntimeHostLookup<Host>;
  requireProjectRuntimeHostForWorkflowVersion: ProjectRuntimeHostLookup<Host>;
  projectBoardDesktopIpcDependencies: Omit<RegisterProjectBoardDomainIpcDependencies, "handleIpc">;
  projectRuntimeHostForTerminal: (...args: any[]) => Host | undefined;
  projectRuntimeHostForWorkflowRun: (...args: any[]) => Host | undefined;
  projectRuntimeHostForWorkspacePath: (...args: any[]) => Host | undefined;
  isActiveProjectRuntimeHost: (host: Host) => boolean;
  activeThreadIdForHost: (host: Host) => string;
}

export function registerMainIpc<Host extends ProjectRuntimeHost>(deps: RegisterMainIpcDependencies<Host>): void {
  const { handleIpc } = deps;
  registerMainAppCoreIpc(deps);

  registerMainProjectWorkspaceIpc(deps);

  registerMainShellBrowserIpc(deps);

  registerMainPluginToolingIpc(deps);

  registerMainWorkflowAutomationIpc(deps);

  registerMainRuntimeInteractionIpc(deps);

  registerE2eDomainIpc({
    handleIpc,
    isE2eEnabled: () => process.env.AMBIENT_E2E === "1",
    emitDesktopEvent: (event, raw) => {
      event.sender.send("desktop:event", raw);
    },
    resolvePermissionGrant: async (input) => {
      const host = deps.requireActiveProjectRuntimeHost();
      const threadId = input.context?.threadId ?? input.request.threadId ?? deps.activeThreadIdForHost(host);
      const thread = host.store.getThread(threadId);
      let promptRequested = false;
      let promptRequest: typeof input.request | undefined;
      const resolution = await resolvePermissionWithGrants({
        store: host.store,
        request: input.request,
        context: {
          permissionMode: input.context?.permissionMode ?? thread.permissionMode,
          threadId,
          workflowThreadId: input.context?.workflowThreadId ?? input.request.workflowThreadId,
          projectPath: input.context?.projectPath ?? host.store.getWorkspace().path,
          workspacePath: input.context?.workspacePath ?? input.request.workspacePath ?? thread.workspacePath,
        },
        requireFreshPrompt: input.requireFreshPrompt,
        requester: {
          request: async (request) => {
            promptRequested = true;
            promptRequest = request;
            return { allowed: false, mode: "deny" };
          },
        },
      });
      return {
        allowed: resolution.allowed,
        decisionSource: resolution.decisionSource,
        response: resolution.response,
        ...(resolution.grant?.id ? { grantId: resolution.grant.id } : {}),
        ...(resolution.grant?.targetHash ? { grantTargetHash: resolution.grant.targetHash } : {}),
        promptRequested,
        ...(promptRequest ? { promptRequest } : {}),
      };
    },
  });
}
