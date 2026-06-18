import type { ExtensionFactory } from "@mariozechner/pi-coding-agent";

import type { PermissionMode } from "../../../shared/permissionTypes";
import type { WorkspaceState } from "../../../shared/workspaceTypes";
import { piToolFieldsFromDescriptor } from "../pluginsDesktopToolFacade";
import type {
  PluginMcpLaunchPlan,
  PluginMcpToolInvocation,
  PluginMcpToolInvocationResult,
  PluginMcpToolRegistration,
} from "../pluginHost";
import { buildToolLongformInputPreview } from "../pluginsToolRuntimeFacade";

export interface PluginMcpToolExtensionOptions {
  workspace: Pick<WorkspaceState, "path">;
  registrations: readonly PluginMcpToolRegistration[];
  getThread: () => { permissionMode: PermissionMode };
  ensurePluginMcpToolTrusted: (registration: PluginMcpToolRegistration) => Promise<boolean> | boolean;
  callCodexPluginMcpTool: (
    plan: PluginMcpLaunchPlan,
    invocation: PluginMcpToolInvocation,
    options: {
      permissionMode: PermissionMode;
      workspacePath: string;
      signal?: AbortSignal;
    },
  ) => Promise<PluginMcpToolInvocationResult>;
}

export function createPluginMcpToolExtension(options: PluginMcpToolExtensionOptions): ExtensionFactory {
  return (pi) => {
    for (const registration of options.registrations) {
      const fields = piToolFieldsFromDescriptor(registration.descriptor);
      pi.registerTool({
        ...fields,
        parameters: fields.parameters as any,
        executionMode: "sequential",
        execute: async (_toolCallId, params, signal, onUpdate) => {
          const trusted = await options.ensurePluginMcpToolTrusted(registration);
          if (!trusted) {
            throw new Error("Codex plugin tool blocked by Ambient Desktop plugin trust policy.");
          }

          const thread = options.getThread();
          const longformInputPreview =
            buildToolLongformInputPreview(registration.registeredName, params) ?? buildToolLongformInputPreview(registration.originalName, params);
          onUpdate?.({
            content: [
              {
                type: "text",
                text: `Calling Codex plugin "${registration.tool.pluginName}" tool "${registration.originalName}".`,
              },
            ],
            details: {
              pluginId: registration.tool.pluginId,
              pluginName: registration.tool.pluginName,
              serverName: registration.tool.serverName,
              toolName: registration.originalName,
              registeredName: registration.registeredName,
              source: "plugin-mcp",
              runtime: "chat",
              permissionMode: thread.permissionMode,
              status: "running",
              ...(longformInputPreview ? { toolLongformInputPreview: longformInputPreview } : {}),
            },
          });

          const result = await options.callCodexPluginMcpTool(
            registration.launchPlan,
            {
              toolName: registration.originalName,
              arguments: params as Record<string, unknown>,
            },
            {
              permissionMode: thread.permissionMode,
              workspacePath: options.workspace.path,
              signal,
            },
          );

          return {
            content: result.content,
            details: {
              ...result.details,
              registeredName: registration.registeredName,
              source: "plugin-mcp",
              runtime: "chat",
              permissionMode: thread.permissionMode,
              result: "completed",
              ...(longformInputPreview ? { toolLongformInputPreview: longformInputPreview } : {}),
            },
          };
        },
      });
    }
  };
}
