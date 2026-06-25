import { isAbsolute, relative, resolve } from "node:path";

import type {
  AmbientPermissionGrant,
  CreateAmbientPermissionGrantInput,
  PermissionGrantActionKind,
  PermissionGrantScopeKind,
  PermissionMode,
} from "../../shared/permissionTypes";
import { permissionGrantHash } from "./permissionPolicyInputFields";

export const LOCAL_FOLDER_ALLOWLIST_OPERATION = "local_folder_allowlist";

export interface LocalFolderAllowlistGrantInput {
  folderPath: string;
  threadId: string;
  workspacePath: string;
  permissionMode: PermissionMode;
}

export interface PermissionGrantPathAccessContext {
  threadId: string;
  projectPath?: string;
  workspacePath?: string;
}

export function createLocalFolderAllowlistGrantInput({
  folderPath,
  threadId,
  workspacePath,
  permissionMode,
}: LocalFolderAllowlistGrantInput): CreateAmbientPermissionGrantInput {
  const canonicalFolderPath = resolve(folderPath);
  return {
    createdBy: "user",
    permissionModeAtCreation: permissionMode,
    scopeKind: "thread",
    threadId,
    workspacePath,
    actionKind: "file_content_read",
    targetKind: "path",
    targetHash: permissionGrantHash("file_content_read", "path", canonicalFolderPath),
    targetLabel: canonicalFolderPath,
    conditions: {
      provider: "ambient.desktop",
      operation: LOCAL_FOLDER_ALLOWLIST_OPERATION,
      path: canonicalFolderPath,
      canonicalPath: canonicalFolderPath,
      pathKind: "directory",
      includesDescendants: true,
      access: "read",
    },
    source: "settings",
    reason: "User added this folder to the thread local file allow list.",
  };
}

export function permissionGrantAllowsLocalPath(
  grant: AmbientPermissionGrant,
  context: PermissionGrantPathAccessContext,
  requestedPath: string,
  actionKind: PermissionGrantActionKind = "file_content_read",
  now = Date.now(),
): boolean {
  if (!activeGrantMatchesScope(grant, context, now)) return false;
  if (grant.targetKind !== "path") return false;
  if (!grantActionAllowsAccess(grant.actionKind, actionKind)) return false;
  const rootPath = permissionGrantPathRoot(grant);
  if (!rootPath) return false;
  const root = resolve(rootPath);
  const requested = resolve(requestedPath);
  if (grantIncludesDescendants(grant)) return lexicalPathInside(root, requested);
  return root === requested;
}

export function permissionGrantAllowsRequestPath(
  grant: AmbientPermissionGrant,
  context: PermissionGrantPathAccessContext,
  requestedPath: string,
  actionKind: PermissionGrantActionKind,
  now?: Date,
): boolean {
  return permissionGrantAllowsLocalPath(grant, context, requestedPath, actionKind, now?.getTime());
}

export function permissionGrantPathRoot(grant: Pick<AmbientPermissionGrant, "targetLabel" | "conditions">): string | undefined {
  const canonicalConditionsPath = grant.conditions && typeof grant.conditions.canonicalPath === "string"
    ? grant.conditions.canonicalPath
    : undefined;
  const conditionsPath = grant.conditions && typeof grant.conditions.path === "string"
    ? grant.conditions.path
    : undefined;
  return canonicalConditionsPath ?? conditionsPath ?? grant.targetLabel;
}

export function grantIncludesDescendants(grant: Pick<AmbientPermissionGrant, "conditions">): boolean {
  return Boolean(
    grant.conditions &&
      grant.conditions.operation === LOCAL_FOLDER_ALLOWLIST_OPERATION &&
      grant.conditions.includesDescendants === true,
  );
}

function activeGrantMatchesScope(
  grant: AmbientPermissionGrant,
  context: PermissionGrantPathAccessContext,
  now: number,
): boolean {
  if (grant.revokedAt) return false;
  if (grant.expiresAt && new Date(grant.expiresAt).getTime() <= now) return false;
  if (grant.scopeKind === "thread") return grant.threadId === context.threadId;
  if (grant.scopeKind === "project") return Boolean(context.projectPath && grant.projectPath === context.projectPath);
  if (grant.scopeKind === "workspace") return Boolean(context.workspacePath && grant.workspacePath === context.workspacePath);
  return false;
}

function grantActionAllowsAccess(grantActionKind: PermissionGrantActionKind, requestedActionKind: PermissionGrantActionKind): boolean {
  if (grantActionKind === requestedActionKind) return true;
  return requestedActionKind === "file_content_read" && grantActionKind === "local_file_write";
}

function lexicalPathInside(parentPath: string, childPath: string): boolean {
  const parent = resolve(parentPath);
  const child = resolve(childPath);
  const childRelativePath = relative(parent, child);
  return childRelativePath === "" || (!childRelativePath.startsWith("..") && !isAbsolute(childRelativePath));
}
