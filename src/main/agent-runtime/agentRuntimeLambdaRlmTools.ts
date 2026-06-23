import type { Model } from "@mariozechner/pi-ai";
import type { ExtensionFactory } from "@mariozechner/pi-coding-agent";

import type { WorkspaceState } from "../../shared/workspaceTypes";
import { createLambdaRlmToolDefinition } from "./agentRuntimeToolRuntimeFacade";
import type { AmbientFileAuthorityRequester } from "./agentRuntimePiFacade";
import {
  registerAgentRuntimeAsyncLongContextTools,
  type AgentRuntimeAsyncLongContextToolRegistrationOptions,
} from "./tools/agentRuntimeAsyncLongContextTools";

export interface LambdaRlmToolExtensionOptions {
  threadId?: string;
  workspace: Pick<WorkspaceState, "path">;
  authorityRootPaths: () => readonly string[];
  includeWorkspaceRootAuthority?: () => boolean;
  requestFileAuthority?: AmbientFileAuthorityRequester;
  model: Model<"openai-completions">;
  apiKey?: string;
  getRunId?: () => string | undefined;
  asyncLongContextJobs?: AgentRuntimeAsyncLongContextToolRegistrationOptions["asyncLongContextJobs"];
}

export function createLambdaRlmToolExtension(options: LambdaRlmToolExtensionOptions): ExtensionFactory {
  return (pi) => {
    const toolOptions = {
      workspacePath: options.workspace.path,
      authorityRootPaths: options.authorityRootPaths,
      includeWorkspaceRootAuthority: options.includeWorkspaceRootAuthority,
      requestFileAuthority: options.requestFileAuthority,
      model: options.model,
      apiKey: options.apiKey,
    };
    pi.registerTool(createLambdaRlmToolDefinition(toolOptions));
    if (options.threadId && options.asyncLongContextJobs) {
      registerAgentRuntimeAsyncLongContextTools(pi, {
        threadId: options.threadId,
        workspacePath: options.workspace.path,
        getRunId: options.getRunId,
        asyncLongContextJobs: options.asyncLongContextJobs,
        toolOptions,
      });
    }
  };
}
