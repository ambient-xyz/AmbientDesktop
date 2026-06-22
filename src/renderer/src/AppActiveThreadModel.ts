import { useMemo } from "react";

import type { BrowserUserActionState } from "../../shared/browserTypes";
import type { DesktopState } from "../../shared/desktopTypes";
import { isAmbientTencentDbMemoryEnabled } from "../../shared/featureFlags";
import { resolveLocalDeepResearchRunBudget } from "../../shared/localDeepResearchBudget";
import type { LocalDeepResearchRunBudget } from "../../shared/localRuntimeTypes";
import type { PermissionRequest, PrivilegedCredentialRequest, SecureInputRequest } from "../../shared/permissionTypes";
import type { ChatMessage, RunStatus, RuntimeActivity, ThreadSummary } from "../../shared/threadTypes";
import { chatBrowserUserActionForThread } from "./AppChatChrome";
import type { PromptProjectRequest } from "./AppDesktopEventGuards";
import { runtimeActivityVisibleForThreadGoal } from "./AppGoalControls";
import { activeThreadHasRunningLocalDeepResearch } from "./AppLocalDeepResearchRunState";
import { selectActivePermissionRequest } from "./AppPermissionActions";
import type { SidebarArea } from "./AppShellSidebar";

type LocalDeepResearchRunBudgetOverride = Partial<Pick<LocalDeepResearchRunBudget, "effort" | "maxToolCalls" | "onExhausted">>;

export interface AppActiveThreadModelInput {
  activity: RuntimeActivity | undefined;
  activeThread?: ThreadSummary;
  chatBrowserUserAction: BrowserUserActionState | undefined;
  localDeepResearchBudgetOverride: LocalDeepResearchRunBudgetOverride | undefined;
  localDeepResearchReady: boolean;
  localDeepResearchRunActive?: boolean;
  localDeepResearchRunBudget?: LocalDeepResearchRunBudget;
  permissionRequests: PermissionRequest[];
  platform: string;
  privilegedCredentialRequests: PrivilegedCredentialRequest[];
  promptRequestMatchesActiveProject: (request: PromptProjectRequest) => boolean;
  secureInputRequests: SecureInputRequest[];
  sidebarArea: SidebarArea;
  state: DesktopState | undefined;
  threadRunStatuses: Record<string, RunStatus>;
}

export interface AppActiveThreadModel {
  activeActivity: RuntimeActivity | undefined;
  activeChatBrowserUserAction: BrowserUserActionState | undefined;
  activePermissionRequest: PermissionRequest | undefined;
  activePrivilegedCredentialRequest: PrivilegedCredentialRequest | undefined;
  activeSecureInputRequest: SecureInputRequest | undefined;
  activeThread: ThreadSummary | undefined;
  isMac: boolean;
  localDeepResearchReady: boolean;
  localDeepResearchRunActive: boolean;
  localDeepResearchRunBudget: LocalDeepResearchRunBudget;
  showTopbarThreadMemoryToggle: boolean;
}

export function useAppActiveThreadModel(input: AppActiveThreadModelInput): AppActiveThreadModel {
  const { localDeepResearchBudgetOverride, state } = input;
  const activeThread = useMemo(() => selectAppActiveThread(state), [state?.activeThreadId, state?.threads]);
  const localDeepResearchRunActive = useMemo(() => selectAppLocalDeepResearchRunActive(state?.messages), [state?.messages]);
  const localDeepResearchRunBudget = useMemo(
    () => selectAppLocalDeepResearchRunBudget(state, localDeepResearchBudgetOverride),
    [
      state?.settings.localDeepResearch.runBudget.defaultEffort,
      state?.settings.localDeepResearch.runBudget.customMaxToolCalls,
      state?.settings.localDeepResearch.runBudget.onExhausted,
      localDeepResearchBudgetOverride,
    ],
  );

  return createAppActiveThreadModel({
    ...input,
    activeThread,
    localDeepResearchRunActive,
    localDeepResearchRunBudget,
  });
}

export function createAppActiveThreadModel({
  activity,
  activeThread: providedActiveThread,
  chatBrowserUserAction,
  localDeepResearchBudgetOverride,
  localDeepResearchReady,
  localDeepResearchRunActive: providedLocalDeepResearchRunActive,
  localDeepResearchRunBudget: providedLocalDeepResearchRunBudget,
  permissionRequests,
  platform,
  privilegedCredentialRequests,
  promptRequestMatchesActiveProject,
  secureInputRequests,
  sidebarArea,
  state,
  threadRunStatuses,
}: AppActiveThreadModelInput): AppActiveThreadModel {
  const activeThread = providedActiveThread ?? selectAppActiveThread(state);
  const localDeepResearchRunActive = providedLocalDeepResearchRunActive ?? selectAppLocalDeepResearchRunActive(state?.messages);
  const localDeepResearchRunBudget =
    providedLocalDeepResearchRunBudget ?? selectAppLocalDeepResearchRunBudget(state, localDeepResearchBudgetOverride);
  const activeThreadId = state?.activeThreadId;

  return {
    activeActivity: selectAppActiveActivity(activity, state),
    activeChatBrowserUserAction: chatBrowserUserActionForThread(chatBrowserUserAction, activeThreadId),
    activePermissionRequest: activeThreadId
      ? selectActivePermissionRequest(permissionRequests.filter(promptRequestMatchesActiveProject), activeThreadId, threadRunStatuses)
      : undefined,
    activePrivilegedCredentialRequest: activeThreadId ? privilegedCredentialRequests.find(promptRequestMatchesActiveProject) : undefined,
    activeSecureInputRequest: activeThreadId ? secureInputRequests.find(promptRequestMatchesActiveProject) : undefined,
    activeThread,
    isMac: platform.toLowerCase().includes("mac"),
    localDeepResearchReady,
    localDeepResearchRunActive,
    localDeepResearchRunBudget,
    showTopbarThreadMemoryToggle: Boolean(
      state &&
      sidebarArea === "projects" &&
      activeThread?.kind !== "subagent_child" &&
      isAmbientTencentDbMemoryEnabled(state.featureFlagSnapshot),
    ),
  };
}

export function selectAppActiveThread(state: DesktopState | undefined): ThreadSummary | undefined {
  return state?.threads.find((thread) => thread.id === state.activeThreadId);
}

export function selectAppLocalDeepResearchRunActive(messages: readonly ChatMessage[] | undefined): boolean {
  return activeThreadHasRunningLocalDeepResearch(messages);
}

export function selectAppLocalDeepResearchRunBudget(
  state: DesktopState | undefined,
  localDeepResearchBudgetOverride: LocalDeepResearchRunBudgetOverride | undefined,
): LocalDeepResearchRunBudget {
  return resolveLocalDeepResearchRunBudget(state?.settings.localDeepResearch.runBudget, localDeepResearchBudgetOverride);
}

function selectAppActiveActivity(activity: RuntimeActivity | undefined, state: DesktopState | undefined): RuntimeActivity | undefined {
  if (!state || activity?.threadId !== state.activeThreadId) return undefined;
  return runtimeActivityVisibleForThreadGoal(activity, state.activeThreadGoal) ? activity : undefined;
}
