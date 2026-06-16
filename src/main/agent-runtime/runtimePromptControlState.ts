export interface RuntimePromptControlStateSnapshot {
  queueReady: boolean;
  runEventSeq: number;
  streamWatchdogTimedOut: boolean;
  streamWatchdogTimeoutMessage?: string | undefined;
}

export interface RuntimePromptControlState {
  isQueueReady: () => boolean;
  markQueueReady: () => void;
  runEventSeq: () => number;
  incrementRunEventSeq: () => number;
  isStreamTimedOut: () => boolean;
  markStreamTimedOut: () => void;
  streamWatchdogTimeoutMessage: () => string | undefined;
  setStreamWatchdogTimeoutMessage: (message: string | undefined) => void;
  snapshot: () => RuntimePromptControlStateSnapshot;
}

export function createRuntimePromptControlState(): RuntimePromptControlState {
  let queueReady = false;
  let runEventSeq = 0;
  let streamWatchdogTimedOut = false;
  let streamWatchdogTimeoutMessage: string | undefined;

  return {
    isQueueReady: () => queueReady,
    markQueueReady: () => {
      queueReady = true;
    },
    runEventSeq: () => runEventSeq,
    incrementRunEventSeq: () => {
      runEventSeq += 1;
      return runEventSeq;
    },
    isStreamTimedOut: () => streamWatchdogTimedOut,
    markStreamTimedOut: () => {
      streamWatchdogTimedOut = true;
    },
    streamWatchdogTimeoutMessage: () => streamWatchdogTimeoutMessage,
    setStreamWatchdogTimeoutMessage: (message) => {
      streamWatchdogTimeoutMessage = message;
    },
    snapshot: () => ({
      queueReady,
      runEventSeq,
      streamWatchdogTimedOut,
      streamWatchdogTimeoutMessage,
    }),
  };
}
