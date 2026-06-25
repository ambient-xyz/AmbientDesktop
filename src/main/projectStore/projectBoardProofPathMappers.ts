import { isAbsolute, relative } from "node:path";

import { projectBoardTaskToolActionsFromProofOfWork, projectBoardTaskToolChangedFiles } from "./projectStoreProjectBoardFacade";

export function projectBoardChangedPathForImplementationEvidence(path: string, workspacePath?: string): string {
  const cleaned = projectBoardLocalPathLike(path.replace(/^"+|"+$/g, "").replace(/^\.\/+/, ""));
  if (!workspacePath) return cleaned;
  try {
    const normalizedWorkspace = projectBoardLocalPathLike(workspacePath).replace(/\/+$/, "");
    if (!isAbsolute(cleaned) || !isAbsolute(normalizedWorkspace)) return cleaned;
    const relativePath = relative(normalizedWorkspace, cleaned);
    if (!relativePath || relativePath.startsWith("..") || isAbsolute(relativePath)) return cleaned;
    return relativePath;
  } catch {
    return cleaned;
  }
}

function projectBoardLocalPathLike(path: string): string {
  if (!/^file:\/\//i.test(path)) return path;
  try {
    return decodeURIComponent(new URL(path).pathname);
  } catch {
    return path.replace(/^file:\/\//i, "");
  }
}

export function projectBoardIsMeaningfulChangedPath(path: string, workspacePath?: string): boolean {
  const normalized = projectBoardChangedPathForImplementationEvidence(path, workspacePath)
    .replace(/\\/g, "/")
    .replace(/^"+|"+$/g, "")
    .replace(/^\.\/+/, "");
  if (!normalized) return false;
  if (normalized.includes("/node_modules/") || normalized.startsWith("node_modules/")) return false;
  if (normalized.includes("/.git/") || normalized.startsWith(".git/")) return false;
  if (normalized.includes("/.ambient/") || normalized.startsWith(".ambient/")) return false;
  if (normalized.includes("/.ambient-codex/") || normalized.startsWith(".ambient-codex/")) return false;
  if (normalized.includes("/.vite/") || normalized.startsWith(".vite/")) return false;
  if (/(^|\/)\.DS_Store$/.test(normalized)) return false;
  return true;
}

export function projectBoardChangedProofPaths(proof: Record<string, unknown>, workspacePath?: string): string[] {
  const paths: string[] = [];
  const push = (value: unknown) => {
    if (typeof value === "string") {
      const trimmed = value.trim();
      if (!trimmed) return;
      paths.push(projectBoardChangedPathForImplementationEvidence(trimmed.replace(/^[MADRCU?! ]+\s+/, ""), workspacePath));
      return;
    }
    if (!value || typeof value !== "object" || Array.isArray(value)) return;
    const record = value as Record<string, unknown>;
    if (typeof record.path === "string") paths.push(projectBoardChangedPathForImplementationEvidence(record.path.trim(), workspacePath));
    else if (typeof record.file === "string")
      paths.push(projectBoardChangedPathForImplementationEvidence(record.file.trim(), workspacePath));
  };
  if (Array.isArray(proof.changedFiles)) proof.changedFiles.forEach(push);
  if (Array.isArray(proof.gitStatus)) proof.gitStatus.forEach(push);
  projectBoardTaskToolChangedFiles(projectBoardTaskToolActionsFromProofOfWork(proof)).forEach(push);
  return paths.filter(Boolean);
}
