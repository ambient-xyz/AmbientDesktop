import type { CallableWorkflowTaskSummary } from "../../shared/workflowTypes";
import {
  resolveSymphonyParentModeVerifiedLaunch,
  shouldRequireSymphonyParentModeLaunch,
  SYMPHONY_PARENT_MODE_MISSING_WORKFLOW_TASK_ERROR,
  type SymphonyParentModePolicy,
  type SymphonyParentModeVerifiedLaunch,
} from "./agentRuntimeSymphonyParentMode";
import { cleanupRuntimeSession, type RuntimeSessionCleanupResult, type RuntimeSessionCleanupSession } from "./runtimeSessionCleanup";

type CallableWorkflowTaskForSymphonyLaunch = Pick<
  CallableWorkflowTaskSummary,
  "id" | "parentThreadId" | "parentRunId" | "toolName" | "sourceKind"
>;

export interface RuntimeSendSessionLifecycleInput<Session extends RuntimeSessionCleanupSession> {
  threadId: string;
  runId: string;
  getSession: () => Session | undefined;
  removeActiveSessionIfCurrent: (session: Session) => boolean | void;
  usesDedicatedReviewSession: boolean;
  currentThreadPiSessionFile: () => string | null | undefined;
  clearThreadPiSessionFile: (sessionFile: string) => void;
  symphonyParentModePolicy?: SymphonyParentModePolicy | undefined;
  initialSymphonyParentModeVerifiedLaunch?: SymphonyParentModeVerifiedLaunch | undefined;
  listCallableWorkflowTasksForParentRun: (runId: string) => readonly CallableWorkflowTaskForSymphonyLaunch[];
}

export interface RuntimeSendSessionLifecycle {
  cleanupCurrentSession: (options?: { clearPersistedSessionFileIfCurrent?: boolean }) => RuntimeSessionCleanupResult;
  resolveAndStoreCurrentSymphonyParentModeVerifiedLaunch: () => SymphonyParentModeVerifiedLaunch | undefined;
  refreshStoredSymphonyParentModeVerifiedLaunch: () => SymphonyParentModeVerifiedLaunch | undefined;
  currentSymphonyParentModeVerifiedLaunch: () => SymphonyParentModeVerifiedLaunch | undefined;
  assertRequiredSymphonyParentModeLaunch: (verifiedLaunch?: SymphonyParentModeVerifiedLaunch | undefined) => void;
}

export function createRuntimeSendSessionLifecycle<Session extends RuntimeSessionCleanupSession>(
  input: RuntimeSendSessionLifecycleInput<Session>,
): RuntimeSendSessionLifecycle {
  let currentVerifiedLaunch = input.initialSymphonyParentModeVerifiedLaunch;

  const currentSymphonyParentModeTasks = () =>
    input.symphonyParentModePolicy
      ? input
          .listCallableWorkflowTasksForParentRun(input.runId)
          .filter((task) => task.parentThreadId === input.threadId && task.parentRunId === input.runId)
      : [];
  const resolveCurrentSymphonyParentModeVerifiedLaunch = () =>
    resolveSymphonyParentModeVerifiedLaunch({
      policy: input.symphonyParentModePolicy,
      carriedLaunch: currentVerifiedLaunch ?? input.initialSymphonyParentModeVerifiedLaunch,
      parentThreadId: input.threadId,
      parentRunId: input.runId,
      tasks: input.listCallableWorkflowTasksForParentRun(input.runId),
    });

  return {
    cleanupCurrentSession: (options = {}) =>
      cleanupRuntimeSession({
        session: input.getSession(),
        removeActiveSessionIfCurrent: (session) => input.removeActiveSessionIfCurrent(session as Session),
        clearPersistedSessionFileIfCurrent: options.clearPersistedSessionFileIfCurrent
          ? {
              usesDedicatedReviewSession: input.usesDedicatedReviewSession,
              currentThreadPiSessionFile: input.currentThreadPiSessionFile,
              clearThreadPiSessionFile: input.clearThreadPiSessionFile,
            }
          : undefined,
      }),
    resolveAndStoreCurrentSymphonyParentModeVerifiedLaunch: () => {
      currentVerifiedLaunch = resolveCurrentSymphonyParentModeVerifiedLaunch();
      return currentVerifiedLaunch;
    },
    refreshStoredSymphonyParentModeVerifiedLaunch: () => {
      currentVerifiedLaunch = resolveCurrentSymphonyParentModeVerifiedLaunch() ?? currentVerifiedLaunch;
      return currentVerifiedLaunch;
    },
    currentSymphonyParentModeVerifiedLaunch: () => currentVerifiedLaunch,
    assertRequiredSymphonyParentModeLaunch: (verifiedLaunch = currentVerifiedLaunch) => {
      if (
        input.symphonyParentModePolicy &&
        !verifiedLaunch &&
        (currentSymphonyParentModeTasks().length > 0 || shouldRequireSymphonyParentModeLaunch({ policy: input.symphonyParentModePolicy }))
      ) {
        throw new Error(SYMPHONY_PARENT_MODE_MISSING_WORKFLOW_TASK_ERROR);
      }
    },
  };
}
