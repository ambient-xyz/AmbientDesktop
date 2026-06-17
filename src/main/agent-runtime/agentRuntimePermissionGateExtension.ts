import type { ExtensionFactory } from "@mariozechner/pi-coding-agent";

import type { WorkspaceState } from "../../shared/types";

type ToolPermissionBlock = { reason: string };

export interface PermissionGateExtensionOptions {
  threadId: string;
  workspace: WorkspaceState;
  resolveToolCallPermission: (
    threadId: string,
    workspace: WorkspaceState,
    toolName: string,
    toolInput: unknown,
  ) => Promise<ToolPermissionBlock | undefined>;
}

export function createPermissionGateExtension(options: PermissionGateExtensionOptions): ExtensionFactory {
  return (pi) => {
    (pi as any).on("tool_call", async (event: any) => {
      const blocked = await options.resolveToolCallPermission(
        options.threadId,
        options.workspace,
        event.toolName,
        event.input,
      );
      return blocked ? { block: true as const, reason: blocked.reason } : undefined;
    });
  };
}
