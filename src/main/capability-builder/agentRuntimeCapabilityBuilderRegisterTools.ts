import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

import type {
  PermissionGrantScopeKind,
  PermissionRisk,
  ThreadSummary,
  WorkspaceState,
} from "../../shared/types";
import {
  capabilityBuilderRegisterText,
  previewCapabilityBuilderPackage,
  registerCapabilityBuilderPackage,
  type CapabilityBuilderPreviewResult,
  type CapabilityBuilderRegisteredVoiceProvider,
  type CapabilityBuilderRegisterInput,
  type CapabilityBuilderRegisterResult,
} from "./capabilityBuilder";
import { pluginInstallToolDescriptor } from "../desktopToolRegistry";
import { registerDesktopTool } from "../desktopToolRegistration";

type ToolUpdateHandler = (update: {
  content: Array<{ type: "text"; text: string }>;
  details: Record<string, unknown>;
}) => void;

export interface CapabilityBuilderRegisterPermissionRequest {
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

export interface CapabilityBuilderRegisterVoiceCompletion {
  text: string;
  details: Record<string, unknown>;
}

export interface CapabilityBuilderRegisterToolRegistrationOptions {
  workspace: WorkspaceState;
  getThread: () => ThreadSummary;
  parseRegisterInput: (params: Record<string, unknown>) => CapabilityBuilderRegisterInput;
  previewCapabilityBuilderPackage?: (
    workspacePath: string,
    input: CapabilityBuilderRegisterInput,
  ) => Promise<CapabilityBuilderPreviewResult> | CapabilityBuilderPreviewResult;
  registerCapabilityBuilderPackage?: (
    workspacePath: string,
    input: CapabilityBuilderRegisterInput,
  ) => Promise<CapabilityBuilderRegisterResult> | CapabilityBuilderRegisterResult;
  capabilityBuilderRegisterText?: (result: CapabilityBuilderRegisterResult) => string;
  completeRegisteredVoiceProviderSetup: (
    thread: ThreadSummary,
    workspace: WorkspaceState,
    provider: CapabilityBuilderRegisteredVoiceProvider,
  ) => Promise<CapabilityBuilderRegisterVoiceCompletion> | CapabilityBuilderRegisterVoiceCompletion;
  resolveFirstPartyPluginPermission: (input: CapabilityBuilderRegisterPermissionRequest) => Promise<boolean> | boolean;
  markPluginToolsStale: () => void;
}

export function registerCapabilityBuilderRegisterTool(
  pi: Pick<ExtensionAPI, "registerTool">,
  options: CapabilityBuilderRegisterToolRegistrationOptions,
): void {
  const { workspace } = options;
  const previewPackage = options.previewCapabilityBuilderPackage ?? previewCapabilityBuilderPackage;
  const registerPackage = options.registerCapabilityBuilderPackage ?? registerCapabilityBuilderPackage;
  const registerText = options.capabilityBuilderRegisterText ?? capabilityBuilderRegisterText;

  registerDesktopTool(pi, pluginInstallToolDescriptor("ambient_capability_builder_register"), {
    executionMode: "sequential",
    execute: async (_toolCallId, params, _signal, onUpdate?: ToolUpdateHandler) => {
      const thread = options.getThread();
      if (thread.collaborationMode === "planner") throw new Error("Capability Builder registration is blocked in Planner Mode.");
      const input = options.parseRegisterInput(params as Record<string, unknown>);
      const preview = await previewPackage(workspace.path, input);
      if (!preview.valid) throw new Error(`Capability package preview has errors: ${preview.errors.join("; ")}`);
      const detail = [
        `Workspace: ${workspace.path}`,
        `Package: ${preview.packageName}`,
        `Managed root: ${preview.relativeRootPath}`,
        `Git SHA: ${preview.gitSha ?? "unavailable"}`,
        `Commands: ${preview.descriptor?.commandNames.join(", ") || "none"}`,
        `Artifacts: ${preview.descriptor?.artifactOutputTypes.join(", ") || "none declared"}`,
        "Effect: copy the validated package into Ambient-managed CLI package state and make it searchable/describable.",
        "This also supports rollback re-registration of source-preserved generated packages marked unregistered.",
        "Registration requires validation metadata to match the current package content. Ambient may run descriptor health checks during CLI package installation.",
        "No generated capability command is invoked through ambient_cli in this step.",
      ].join("\n");
      const allowed = await options.resolveFirstPartyPluginPermission({
        thread,
        workspace,
        toolName: "ambient_capability_builder_register",
        title: `Register Ambient capability "${preview.packageName}"?`,
        message: "Ambient wants to install a validated managed capability package into Ambient CLI package state.",
        detail,
        grantTargetLabel: `Register capability ${preview.packageName}`,
        grantTargetIdentity: ["ambient_capability_builder_register", workspace.path, preview.packageName, preview.gitSha ?? "unknown"].join("\0"),
        allowedReason: "Capability Builder registration approved by Ambient permission grant policy.",
        deniedReason: "Capability Builder registration prompt denied or timed out.",
      });
      if (!allowed) throw new Error("Capability Builder registration blocked by approval prompt.");
      onUpdate?.({
        content: [{ type: "text", text: `Registering Ambient capability "${preview.packageName}".` }],
        details: {
          runtime: "ambient-capability-builder",
          toolName: "ambient_capability_builder_register",
          status: "registering",
          packageName: preview.packageName,
        },
      });
      const result = await registerPackage(workspace.path, input);
      const voiceCompletion = result.voiceProvider
        ? await options.completeRegisteredVoiceProviderSetup(thread, workspace, result.voiceProvider)
        : undefined;
      options.markPluginToolsStale();
      return {
        content: [{ type: "text" as const, text: [registerText(result), voiceCompletion?.text].filter(Boolean).join("\n\n") }],
        details: {
          runtime: "ambient-capability-builder",
          toolName: "ambient_capability_builder_register",
          status: "registered",
          packageName: result.packageName,
          rootPath: result.rootPath,
          relativeRootPath: result.relativeRootPath,
          gitSha: result.gitSha,
          registeredAt: result.registeredAt,
          installedPackageId: result.installedPackage.id,
          installedPackageName: result.installedPackage.name,
          installedSource: result.installedPackage.source,
          commandCount: result.installedPackage.commands.length,
          skillCount: result.installedPackage.skills.length,
          availability: "next-session-refresh",
          ...(voiceCompletion ? { voiceCompletion: voiceCompletion.details } : {}),
        },
      };
    },
  });
}
