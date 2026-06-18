import type { Model } from "@mariozechner/pi-ai";
import type { ExtensionFactory } from "@mariozechner/pi-coding-agent";

import type { WorkspaceState } from "../../shared/workspaceTypes";
import { createLambdaRlmToolDefinition } from "./agentRuntimeToolRuntimeFacade";
import type { AmbientFileAuthorityRequester } from "./agentRuntimePiFacade";

export interface LambdaRlmToolExtensionOptions {
  workspace: Pick<WorkspaceState, "path">;
  authorityRootPaths: () => readonly string[];
  includeWorkspaceRootAuthority?: () => boolean;
  requestFileAuthority?: AmbientFileAuthorityRequester;
  model: Model<"openai-completions">;
  apiKey?: string;
}

export function createLambdaRlmToolExtension(options: LambdaRlmToolExtensionOptions): ExtensionFactory {
  return (pi) => {
    pi.registerTool(createLambdaRlmToolDefinition({
      workspacePath: options.workspace.path,
      authorityRootPaths: options.authorityRootPaths,
      includeWorkspaceRootAuthority: options.includeWorkspaceRootAuthority,
      requestFileAuthority: options.requestFileAuthority,
      model: options.model,
      apiKey: options.apiKey,
    }));
  };
}
