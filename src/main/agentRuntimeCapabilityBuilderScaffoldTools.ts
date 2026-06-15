import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

import type {
  PermissionGrantScopeKind,
  PermissionRisk,
  ThreadSummary,
  WorkspaceState,
} from "../shared/types";
import {
  capabilityBuilderScaffoldText,
  scaffoldCapabilityBuilderPackage,
  type CapabilityBuilderScaffoldInput,
  type CapabilityBuilderScaffoldResult,
} from "./capabilityBuilder";
import { pluginInstallToolDescriptor } from "./desktopToolRegistry";
import { registerDesktopTool } from "./desktopToolRegistration";

type ToolUpdateHandler = (update: {
  content: Array<{ type: "text"; text: string }>;
  details: Record<string, unknown>;
}) => void;

export interface CapabilityBuilderScaffoldPermissionRequest {
  thread: ThreadSummary;
  workspace: WorkspaceState;
  toolName: string;
  title: string;
  message: string;
  detail: string;
  risk?: PermissionRisk;
  reusableScopes?: PermissionGrantScopeKind[];
  grantTargetLabel: string;
  grantTargetIdentity?: string;
  grantConditions?: Record<string, unknown>;
  requireFreshPrompt?: boolean;
  allowedReason: string;
  deniedReason: string;
}

export interface CapabilityBuilderScaffoldToolRegistrationOptions {
  workspace: WorkspaceState;
  getThread: () => ThreadSummary;
  parseScaffoldInput: (params: Record<string, unknown>) => CapabilityBuilderScaffoldInput;
  suggestedCapabilityPackageName: (goal: string, provider: string | undefined) => string;
  scaffoldCapabilityBuilderPackage?: (
    workspacePath: string,
    input: CapabilityBuilderScaffoldInput,
  ) => Promise<CapabilityBuilderScaffoldResult> | CapabilityBuilderScaffoldResult;
  capabilityBuilderScaffoldText?: (result: CapabilityBuilderScaffoldResult) => string;
  resolveFirstPartyPluginPermission: (input: CapabilityBuilderScaffoldPermissionRequest) => Promise<boolean> | boolean;
  markPluginToolsStale: () => void;
}

export function registerCapabilityBuilderScaffoldTool(
  pi: Pick<ExtensionAPI, "registerTool">,
  options: CapabilityBuilderScaffoldToolRegistrationOptions,
): void {
  const { workspace } = options;
  const scaffoldPackage = options.scaffoldCapabilityBuilderPackage ?? scaffoldCapabilityBuilderPackage;
  const scaffoldText = options.capabilityBuilderScaffoldText ?? capabilityBuilderScaffoldText;

  registerDesktopTool(pi, pluginInstallToolDescriptor("ambient_capability_builder_scaffold"), {
    executionMode: "sequential",
    execute: async (_toolCallId, params, _signal, onUpdate?: ToolUpdateHandler) => {
      const thread = options.getThread();
      if (thread.collaborationMode === "planner") throw new Error("Capability Builder scaffolding is blocked in Planner Mode.");
      const input = options.parseScaffoldInput(params as Record<string, unknown>);
      const previewName = options.suggestedCapabilityPackageName(input.name ?? input.goal, input.provider);
      const detail = [
        `Workspace: ${workspace.path}`,
        `Managed root: .ambient/capability-builder/packages/${previewName}`,
        `Goal: ${input.goal}`,
        input.installerShape ? `Installer shape: ${input.installerShape}` : undefined,
        input.kind ? `Kind: ${input.kind}` : undefined,
        input.provider ? `Provider/runtime: ${input.provider}` : undefined,
        input.outputArtifactTypes?.length ? `File artifacts: ${input.outputArtifactTypes.join(", ")}` : undefined,
        `Locality: ${input.locality ?? "either"}`,
        "Effect: writes starter package files under the managed builder root and initializes package-local Git.",
        "No dependency installation, validation, registration, activation, or capability command execution happens in this step.",
      ].filter(Boolean).join("\n");
      const allowed = await options.resolveFirstPartyPluginPermission({
        thread,
        workspace,
        toolName: "ambient_capability_builder_scaffold",
        title: `Scaffold Ambient capability "${previewName}"?`,
        message: "Ambient wants to create a managed draft capability package in this workspace.",
        detail,
        grantTargetLabel: `Scaffold capability ${previewName}`,
        grantTargetIdentity: ["ambient_capability_builder_scaffold", workspace.path, previewName].join("\0"),
        allowedReason: "Capability Builder scaffold approved by Ambient permission grant policy.",
        deniedReason: "Capability Builder scaffold prompt denied or timed out.",
      });
      if (!allowed) throw new Error("Capability Builder scaffold blocked by approval prompt.");
      onUpdate?.({
        content: [{ type: "text", text: `Scaffolding Ambient capability "${previewName}".` }],
        details: { runtime: "ambient-capability-builder", toolName: "ambient_capability_builder_scaffold", status: "scaffolding", packageName: previewName },
      });
      const result = await scaffoldPackage(workspace.path, input);
      options.markPluginToolsStale();
      return {
        content: [{ type: "text" as const, text: scaffoldText(result) }],
        details: {
          runtime: "ambient-capability-builder",
          toolName: "ambient_capability_builder_scaffold",
          status: "scaffolded",
          packageName: result.name,
          installerShape: result.installerShape,
          rootPath: result.rootPath,
          relativeRootPath: result.relativeRootPath,
          sourceRef: result.sourceRef,
          gitSha: result.gitSha,
          files: result.files,
        },
      };
    },
  });
}
