export interface RuntimeSessionCleanupSession {
  sessionFile?: string;
  dispose(): void;
}

export interface RuntimeSessionFileClearInput {
  usesDedicatedReviewSession: boolean;
  currentThreadPiSessionFile: () => string | null | undefined;
  clearThreadPiSessionFile: (sessionFile: string) => void;
}

export interface RuntimeSessionCleanupInput {
  session?: RuntimeSessionCleanupSession | undefined;
  removeActiveSessionIfCurrent?: (session: RuntimeSessionCleanupSession) => boolean | void;
  clearPersistedSessionFileIfCurrent?: RuntimeSessionFileClearInput | undefined;
}

export interface RuntimeSessionCleanupResult {
  removedActiveSession: boolean;
  disposedSession: boolean;
  disposeFailed: boolean;
  clearedPersistedSessionFile: boolean;
}

export function cleanupRuntimeSession(input: RuntimeSessionCleanupInput): RuntimeSessionCleanupResult {
  const { session } = input;
  if (!session) {
    return {
      removedActiveSession: false,
      disposedSession: false,
      disposeFailed: false,
      clearedPersistedSessionFile: false,
    };
  }

  const removedActiveSession = Boolean(input.removeActiveSessionIfCurrent?.(session));
  let disposeFailed = false;
  try {
    session.dispose();
  } catch {
    disposeFailed = true;
  }

  const clearInput = input.clearPersistedSessionFileIfCurrent;
  const shouldClearSessionFile =
    Boolean(clearInput) &&
    !clearInput!.usesDedicatedReviewSession &&
    Boolean(session.sessionFile) &&
    clearInput!.currentThreadPiSessionFile() === session.sessionFile;
  if (shouldClearSessionFile && session.sessionFile) {
    clearInput!.clearThreadPiSessionFile(session.sessionFile);
  }

  return {
    removedActiveSession,
    disposedSession: true,
    disposeFailed,
    clearedPersistedSessionFile: shouldClearSessionFile,
  };
}
