import { createHash } from "node:crypto";
import { resolve } from "node:path";

export function normalizeWorkspacePath(workspacePath: string): string {
  return resolve(workspacePath);
}

export function workspaceAuthorityId(workspacePath: string): string {
  return createHash("sha256").update(resolve(workspacePath)).digest("hex");
}

export function projectIdFromWorkspacePath(workspacePath: string): string {
  return workspaceAuthorityId(normalizeWorkspacePath(workspacePath));
}
