import { describe, expect, it, vi } from "vitest";

import type { Model } from "@mariozechner/pi-ai";
import type { WorkspaceState } from "../../shared/workspaceTypes";
import { createLambdaRlmToolExtension } from "./agentRuntimeLambdaRlmTools";

type RegisteredTool = {
  name: string;
  executionMode?: string;
  execute?: (...args: any[]) => Promise<any>;
};

const mocks = vi.hoisted(() => ({
  createLambdaRlmToolDefinition: vi.fn((options: unknown) => ({
    name: "long_context_process",
    executionMode: "sequential" as const,
    options,
  })),
}));

vi.mock("./agentRuntimeToolRuntimeFacade", () => ({
  createLambdaRlmToolDefinition: mocks.createLambdaRlmToolDefinition,
}));

describe("createLambdaRlmToolExtension", () => {
  it("registers the Lambda RLM long context tool with runtime dependencies", () => {
    const registeredTools: RegisteredTool[] = [];
    const authorityRoots = ["/tmp/workspace", "/tmp/shared"];
    const authorityRootPaths = vi.fn(() => authorityRoots);
    const includeWorkspaceRootAuthority = vi.fn(() => false);
    const modelReference = {} as Model<"openai-completions">;

    createLambdaRlmToolExtension({
      workspace: workspace(),
      authorityRootPaths,
      includeWorkspaceRootAuthority,
      model: modelReference,
      apiKey: undefined,
    })({
      registerTool: (tool: any) => {
        registeredTools.push(tool);
      },
    } as any);

    expect(registeredTools.map((tool) => tool.name)).toEqual(["long_context_process"]);
    expect(registeredTools[0]).toMatchObject({
      executionMode: "sequential",
    });
    expect(mocks.createLambdaRlmToolDefinition).toHaveBeenCalledTimes(1);
    const [options] = mocks.createLambdaRlmToolDefinition.mock.calls[0]!;
    expect(options).toMatchObject({
      workspacePath: "/tmp/workspace",
      model: modelReference,
      apiKey: undefined,
    });
    expect((options as { authorityRootPaths: () => readonly string[] }).authorityRootPaths()).toEqual(authorityRoots);
    expect((options as { includeWorkspaceRootAuthority: () => boolean }).includeWorkspaceRootAuthority()).toBe(false);
    expect(authorityRootPaths).toHaveBeenCalledTimes(1);
    expect(includeWorkspaceRootAuthority).toHaveBeenCalledTimes(1);
  });
});

function workspace(): WorkspaceState {
  return {
    path: "/tmp/workspace",
    name: "workspace",
    statePath: "/tmp/workspace/.ambient",
    sessionPath: "/tmp/workspace/.ambient/session",
  };
}
