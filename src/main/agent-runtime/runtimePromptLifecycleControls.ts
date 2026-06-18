import type { DesktopEvent } from "../../shared/desktopTypes";
import type { RunStatus } from "../../shared/threadTypes";
import type { RuntimePromptCompletion } from "./runtimePromptCompletionLoop";

export type RuntimeActiveRunStatus = Exclude<RunStatus, "idle" | "error">;
export type RuntimePersistedActiveRunStatus = Extract<RunStatus, "starting" | "streaming" | "tool">;

const PERSISTED_ACTIVE_RUN_STATUSES = new Set<RuntimePersistedActiveRunStatus>(["starting", "streaming", "tool"]);

export interface RuntimePromptLifecycleControlsInput {
  threadId: string;
  runId: string;
  initialStatus: RuntimeActiveRunStatus;
  isRunStoreActive: () => boolean;
  updateRunStatus: (runId: string, status: RuntimePersistedActiveRunStatus) => void;
  emitRunEvent: (event: DesktopEvent) => void;
}

export interface RuntimePromptLifecycleControls {
  streamWatchdogCompletion: Promise<RuntimePromptCompletion>;
  setActiveRunStatus: (status: RuntimeActiveRunStatus) => void;
  signalStreamWatchdogTimeout: () => void;
  signalToolExecutionTimeout: () => void;
  signalParentControlAbort: () => void;
}

export function createRuntimePromptLifecycleControls(
  input: RuntimePromptLifecycleControlsInput,
): RuntimePromptLifecycleControls {
  let lastEmittedRunStatus = input.initialStatus;
  let resolveStreamWatchdogCompletion: ((completion: RuntimePromptCompletion) => void) | undefined;
  const streamWatchdogCompletion = new Promise<RuntimePromptCompletion>((resolve) => {
    resolveStreamWatchdogCompletion = resolve;
  });

  return {
    streamWatchdogCompletion,
    setActiveRunStatus: (status) => {
      if (!input.isRunStoreActive()) return;
      if (lastEmittedRunStatus === status) return;
      lastEmittedRunStatus = status;
      if (isPersistedActiveRunStatus(status)) {
        input.updateRunStatus(input.runId, status);
      }
      input.emitRunEvent({ type: "run-status", threadId: input.threadId, status });
    },
    signalStreamWatchdogTimeout: () => {
      resolveStreamWatchdogCompletion?.("stream-timeout");
    },
    signalToolExecutionTimeout: () => {
      resolveStreamWatchdogCompletion?.("tool-timeout");
    },
    signalParentControlAbort: () => {
      resolveStreamWatchdogCompletion?.("parent-control-abort");
    },
  };
}

function isPersistedActiveRunStatus(status: RuntimeActiveRunStatus): status is RuntimePersistedActiveRunStatus {
  return PERSISTED_ACTIVE_RUN_STATUSES.has(status as RuntimePersistedActiveRunStatus);
}
