import type { IpcMain } from "electron";
import { z } from "zod";

import type {
  AmbientPermissionGrant,
  CreateAmbientPermissionGrantInput,
  PermissionAuditEntry,
  PermissionPromptResponseMode,
  PermissionRequest,
  RevokeAmbientPermissionGrantInput,
} from "../../shared/permissionTypes";

type HandleIpc = (channel: string, listener: Parameters<IpcMain["handle"]>[1]) => void;
type MaybePromise<T> = T | Promise<T>;

export const permissionListIpcChannels = [
  "permission:audit",
  "permission:grants",
  "permission:pending",
] as const;
export const permissionCreateGrantIpcChannels = ["permission:create-grant"] as const;
export const permissionRevokeGrantIpcChannels = ["permission:revoke-grant"] as const;
export const permissionRespondIpcChannels = ["permission:respond"] as const;

export interface RegisterPermissionListIpcDependencies {
  handleIpc: HandleIpc;
  listPermissionAudit(): MaybePromise<PermissionAuditEntry[]>;
  listPermissionGrants(): MaybePromise<AmbientPermissionGrant[]>;
  listPendingPermissionRequests(): MaybePromise<PermissionRequest[]>;
}

export interface RegisterPermissionCreateGrantIpcDependencies {
  handleIpc: HandleIpc;
  createPermissionGrant(input: CreateAmbientPermissionGrantInput): MaybePromise<AmbientPermissionGrant>;
}

export interface RegisterPermissionRevokeGrantIpcDependencies {
  handleIpc: HandleIpc;
  revokePermissionGrant(input: RevokeAmbientPermissionGrantInput): MaybePromise<AmbientPermissionGrant>;
}

export interface RegisterPermissionRespondIpcDependencies {
  handleIpc: HandleIpc;
  respondPermissionPrompt(id: string, response: PermissionPromptResponseMode): MaybePromise<void>;
}

const createPermissionGrantSchema = z.object({
  expiresAt: z.string().min(1).optional(),
  createdBy: z.enum(["user", "migration", "system"]).optional(),
  permissionModeAtCreation: z.enum(["full-access", "workspace"]),
  scopeKind: z.enum(["thread", "workflow_thread", "project", "workspace", "global_plugin"]),
  threadId: z.string().min(1).optional(),
  workflowThreadId: z.string().min(1).optional(),
  projectPath: z.string().min(1).optional(),
  workspacePath: z.string().min(1).optional(),
  actionKind: z.enum([
    "file_metadata_read",
    "file_content_read",
    "secret_path_read",
    "connector_metadata_read",
    "connector_account_data_read",
    "connector_content_read",
    "plugin_metadata_read",
    "plugin_tool_execute",
    "browser_network",
    "browser_control",
    "browser_profile",
    "browser_login",
    "shell_command",
    "local_file_write",
    "remote_mutation",
  ]),
  targetKind: z.enum(["path", "path_glob", "connector", "connector_account", "plugin", "tool", "browser_origin", "shell_command_prefix", "mutation_policy", "risk"]),
  targetHash: z.string().min(1),
  targetLabel: z.string().min(1),
  conditions: z.record(z.string(), z.unknown()).optional(),
  source: z.enum(["permission_prompt", "plugin_trust", "settings", "workflow_review"]).optional(),
  reason: z.string().min(1),
}) satisfies z.ZodType<CreateAmbientPermissionGrantInput>;
const revokePermissionGrantSchema = z.object({ id: z.string().min(1) });
const permissionPromptResponseSchema = z.enum(["deny", "allow_once", "always_thread", "always_workflow", "always_project", "always_workspace"]);

export function registerPermissionListIpc({
  handleIpc,
  listPermissionAudit,
  listPermissionGrants,
  listPendingPermissionRequests,
}: RegisterPermissionListIpcDependencies): void {
  handleIpc("permission:audit", () => listPermissionAudit());
  handleIpc("permission:grants", () => listPermissionGrants());
  handleIpc("permission:pending", () => listPendingPermissionRequests());
}

export function registerPermissionCreateGrantIpc({
  handleIpc,
  createPermissionGrant,
}: RegisterPermissionCreateGrantIpcDependencies): void {
  handleIpc("permission:create-grant", (_event, raw: unknown) =>
    createPermissionGrant(createPermissionGrantSchema.parse(raw)),
  );
}

export function registerPermissionRevokeGrantIpc({
  handleIpc,
  revokePermissionGrant,
}: RegisterPermissionRevokeGrantIpcDependencies): void {
  handleIpc("permission:revoke-grant", (_event, raw: unknown) =>
    revokePermissionGrant(revokePermissionGrantSchema.parse(raw)),
  );
}

export function registerPermissionRespondIpc({
  handleIpc,
  respondPermissionPrompt,
}: RegisterPermissionRespondIpcDependencies): void {
  handleIpc("permission:respond", (_event, id: unknown, response: unknown) =>
    respondPermissionPrompt(z.string().parse(id), permissionPromptResponseSchema.parse(response)),
  );
}
