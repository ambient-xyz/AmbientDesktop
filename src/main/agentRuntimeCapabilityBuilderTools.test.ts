import type { ToolDefinition } from "@mariozechner/pi-coding-agent";
import { describe, expect, it, vi } from "vitest";

import { registerAgentRuntimeCapabilityBuilderTools } from "./agentRuntimeCapabilityBuilderTools";

describe("agentRuntimeCapabilityBuilderTools", () => {
  it("registers the Capability Builder tool group in the existing order", () => {
    const registeredTools: ToolDefinition<any, any, any>[] = [];

    registerAgentRuntimeCapabilityBuilderTools({
      registerTool: (tool: any) => registeredTools.push(tool),
    }, {
      workspace: {
        path: "/workspace",
        name: "Workspace",
        statePath: "/workspace/.ambient",
        sessionPath: "/workspace/.ambient/sessions",
      },
      getThread: () => ({
        id: "thread-1",
        title: "Thread",
        workspacePath: "/workspace",
        createdAt: "2026-06-11T00:00:00.000Z",
        updatedAt: "2026-06-11T00:00:00.000Z",
        lastMessagePreview: "",
        permissionMode: "workspace",
        collaborationMode: "agent",
        model: "model",
        thinkingLevel: "medium",
      }) as any,
      parsePlanInput: () => ({ goal: "Build a provider" }),
      planText: () => "plan",
      routePreflight: () => undefined,
      latestInstallRouteLane: () => undefined,
      mcpAutowirePlanned: () => false,
      parseScaffoldInput: () => ({ goal: "Build a provider" }) as any,
      suggestedCapabilityPackageName: () => "ambient-provider",
      parsePreviewInput: () => ({ packageName: "ambient-provider" }) as any,
      parseListFilesInput: () => ({ packageName: "ambient-provider" }) as any,
      parseReadFileInput: () => ({ packageName: "ambient-provider", path: "README.md" }) as any,
      parseWriteFileInput: () => ({ packageName: "ambient-provider", path: "README.md", content: "hello" }) as any,
      parseSecretRequestInput: () => ({ packageName: "ambient-provider", envName: "API_KEY" }) as any,
      parseHistoryInput: () => ({ packageName: "ambient-provider" }) as any,
      parseUpdatePlanInput: () => ({ packageName: "ambient-provider" }) as any,
      parseRepairPlanInput: () => ({ packageName: "ambient-provider" }) as any,
      parseApplyRepairInput: () => ({ packageName: "ambient-provider" }) as any,
      parseRemovalPlanInput: () => ({ packageName: "ambient-provider" }) as any,
      parseUnregisterInput: () => ({ packageName: "ambient-provider" }) as any,
      parseInstallDepsInput: () => ({ packageName: "ambient-provider" }) as any,
      parseValidateInput: () => ({ packageName: "ambient-provider" }) as any,
      runCapabilityBuilderValidationWithPermission: vi.fn(),
      parseRegisterInput: () => ({ packageName: "ambient-provider" }) as any,
      completeRegisteredVoiceProviderSetup: vi.fn(),
      resolveFirstPartyPluginPermission: vi.fn(async () => true),
      markPluginToolsStale: vi.fn(),
      emitDesktopEvent: vi.fn(),
    });

    expect(registeredTools.map((tool) => tool.name)).toEqual([
      "ambient_capability_builder_plan",
      "ambient_capability_builder_scaffold",
      "ambient_capability_builder_preview",
      "ambient_capability_builder_list_files",
      "ambient_capability_builder_read_file",
      "ambient_capability_builder_write_file",
      "ambient_capability_builder_secret_request",
      "ambient_capability_builder_history",
      "ambient_capability_builder_update_plan",
      "ambient_capability_builder_repair_plan",
      "ambient_capability_builder_apply_repair",
      "ambient_capability_builder_removal_plan",
      "ambient_capability_builder_unregister",
      "ambient_capability_builder_install_deps",
      "ambient_capability_builder_validate",
      "ambient_capability_builder_register",
    ]);
    expect(registeredTools.every((tool) => tool.executionMode === "sequential")).toBe(true);
  });
});
