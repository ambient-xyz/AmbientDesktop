const LOCAL_TASK_WORKSPACE_SEGMENT = "/.ambient-codex/orchestration/workspaces/";

export function canRefreshOfficePreview(file: { kind?: string; officePreview?: { status?: string } }): boolean {
  if (file.kind !== "office") return false;
  return file.officePreview?.status === "missing-renderer" || file.officePreview?.status === "failed";
}

export function isPreparedLocalTaskWorkspace(projectRoot?: string, activeWorkspace?: string): boolean {
  const root = normalizeWorkspacePath(projectRoot);
  const active = normalizeWorkspacePath(activeWorkspace);
  if (!root || !active || active === root) return false;
  return active.startsWith(`${root}${LOCAL_TASK_WORKSPACE_SEGMENT}`);
}

function normalizeWorkspacePath(path?: string): string {
  return (path ?? "").replace(/\\/g, "/").replace(/\/+$/, "");
}
