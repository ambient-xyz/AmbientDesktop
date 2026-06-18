import { useEffect } from "react";
import type { Dispatch, MutableRefObject, SetStateAction } from "react";

import type { AutomationFolderSummary } from "../../shared/automationTypes";
import type { DesktopState } from "../../shared/desktopTypes";
import type { ChatMessage } from "../../shared/threadTypes";
import type { WorkflowAgentFolderSummary } from "../../shared/workflowTypes";
import type { WorkspaceContextReference } from "../../shared/workspaceTypes";
import {
  messageKindForActivity,
} from "./AppMessages";
import {
  shouldClearTransientErrorForActiveScope,
  type TransientErrorScope,
} from "./transientErrorUiModel";
import {
  workspaceProjectAliasesForState,
  type WorkspaceProjectAliases,
} from "./workspaceEventMatching";

export type AppMessageActivityKind = "assistant" | "thinking" | "tool" | "user";

export type AppDesktopStateRefs = {
  activeProjectRootRef: MutableRefObject<string | undefined>;
  activeThreadIdRef: MutableRefObject<string | undefined>;
  workspaceProjectAliasesRef: MutableRefObject<WorkspaceProjectAliases>;
};

export function rememberAppDesktopStateRefs(state: DesktopState, refs: AppDesktopStateRefs): void {
  refs.activeThreadIdRef.current = state.activeThreadId;
  refs.activeProjectRootRef.current = state.workspace.path;
  refs.workspaceProjectAliasesRef.current = workspaceProjectAliasesForState(state, refs.workspaceProjectAliasesRef.current);
}

export function clearAppDesktopStateRefs(refs: AppDesktopStateRefs): void {
  refs.activeThreadIdRef.current = undefined;
  refs.activeProjectRootRef.current = undefined;
}

export function appMessageActivityKindMap(messages: readonly ChatMessage[] | undefined): Record<string, AppMessageActivityKind> {
  return Object.fromEntries(
    (messages ?? []).map((message) => [message.id, messageKindForActivity(message)]),
  ) as Record<string, AppMessageActivityKind>;
}

export function useAppThreadLifecycleEffects({
  activeProjectRootRef,
  activeThreadIdRef,
  errorScope,
  messageKindsRef,
  resetPromptHistory,
  setAutomationFolders,
  setContextAttachments,
  setContextError,
  setErrorScope,
  setErrorState,
  setWorkflowAgentFolders,
  state,
  thinkingDeltaBuffersRef,
  workspaceProjectAliasesRef,
}: AppDesktopStateRefs & {
  errorScope: TransientErrorScope | undefined;
  messageKindsRef: MutableRefObject<Record<string, AppMessageActivityKind>>;
  resetPromptHistory: () => void;
  setAutomationFolders: Dispatch<SetStateAction<AutomationFolderSummary[]>>;
  setContextAttachments: Dispatch<SetStateAction<WorkspaceContextReference[]>>;
  setContextError: Dispatch<SetStateAction<string | undefined>>;
  setErrorScope: Dispatch<SetStateAction<TransientErrorScope | undefined>>;
  setErrorState: Dispatch<SetStateAction<string | undefined>>;
  setWorkflowAgentFolders: Dispatch<SetStateAction<WorkflowAgentFolderSummary[]>>;
  state: DesktopState | undefined;
  thinkingDeltaBuffersRef: MutableRefObject<Record<string, string>>;
}): void {
  useEffect(() => {
    if (state) rememberAppDesktopStateRefs(state, { activeProjectRootRef, activeThreadIdRef, workspaceProjectAliasesRef });
    else clearAppDesktopStateRefs({ activeProjectRootRef, activeThreadIdRef, workspaceProjectAliasesRef });
  }, [state, activeProjectRootRef, activeThreadIdRef, workspaceProjectAliasesRef]);

  useEffect(() => {
    if (
      !shouldClearTransientErrorForActiveScope(errorScope, {
        threadId: state?.activeThreadId,
        workspacePath: state?.workspace.path,
      })
    ) {
      return;
    }
    setErrorScope(undefined);
    setErrorState(undefined);
  }, [errorScope, state?.activeThreadId, state?.workspace.path, setErrorScope, setErrorState]);

  useEffect(() => {
    if (!state) return;
    setAutomationFolders(state.automationFolders);
    setWorkflowAgentFolders(state.workflowAgentFolders);
  }, [state?.automationFolders, state?.workflowAgentFolders, setAutomationFolders, setWorkflowAgentFolders]);

  useEffect(() => {
    messageKindsRef.current = appMessageActivityKindMap(state?.messages);
  }, [state?.messages, messageKindsRef]);

  useEffect(() => {
    setContextAttachments([]);
    setContextError(undefined);
    resetPromptHistory();
    thinkingDeltaBuffersRef.current = {};
  }, [state?.activeThreadId, state?.activeWorkspace.path, setContextAttachments, setContextError, thinkingDeltaBuffersRef]);
}
