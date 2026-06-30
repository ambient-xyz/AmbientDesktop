import type { PermissionMode, PermissionRequest } from "../../shared/permissionTypes";
import type { CollaborationMode } from "../../shared/threadTypes";

export type PermissionPrompt = Omit<PermissionRequest, "id">;

export type PermissionDecision =
  | { action: "allow" }
  | {
      action: "prompt";
      request: PermissionPrompt;
    }
  | {
      action: "deny";
      request: PermissionPrompt;
      reason: string;
    };

export interface PermissionPolicyInput {
  threadId: string;
  permissionMode: PermissionMode;
  collaborationMode?: CollaborationMode;
  workspacePath: string;
  projectPath?: string;
  readOnlyAllowedPaths?: string[];
  toolName: string;
  toolInput: unknown;
}
