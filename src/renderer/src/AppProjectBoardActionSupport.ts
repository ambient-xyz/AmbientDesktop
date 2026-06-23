export function projectBoardActionErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function normalizedProjectBoardActionError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}
