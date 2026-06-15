export interface TransientErrorScope {
  threadId?: string;
  workspacePath?: string;
}

export interface ActiveTransientErrorScope {
  threadId?: string;
  workspacePath?: string;
}

export function transientErrorMatchesActiveScope(
  errorScope: TransientErrorScope | undefined,
  activeScope: ActiveTransientErrorScope,
): boolean {
  if (!errorScope) return true;
  if (errorScope.threadId && errorScope.threadId !== activeScope.threadId) return false;
  if (errorScope.workspacePath && errorScope.workspacePath !== activeScope.workspacePath) return false;
  return true;
}

export function shouldClearTransientErrorForActiveScope(
  errorScope: TransientErrorScope | undefined,
  activeScope: ActiveTransientErrorScope,
): boolean {
  return Boolean(errorScope && !transientErrorMatchesActiveScope(errorScope, activeScope));
}
