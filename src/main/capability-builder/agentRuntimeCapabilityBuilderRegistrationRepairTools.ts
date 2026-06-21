import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

import type { PermissionGrantScopeKind, PermissionRisk } from "../../shared/permissionTypes";
import type { ThreadSummary } from "../../shared/threadTypes";
import type { WorkspaceState } from "../../shared/workspaceTypes";
import {
  capabilityBuilderRegistrationRepairText,
  repairCapabilityBuilderRegistrationMetadata,
  type CapabilityBuilderRegistrationRepairInput,
  type CapabilityBuilderRegistrationRepairResult,
} from "./capabilityBuilder";
import { pluginInstallToolDescriptor, registerDesktopTool } from "./capabilityBuilderDesktopToolFacade";

type ToolUpdateHandler = (update: {
  content: Array<{ type: "text"; text: string }>;
  details: Record<string, unknown>;
}) => void;

export interface CapabilityBuilderRegistrationRepairPermissionRequest {
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

export interface CapabilityBuilderRegistrationRepairToolRegistrationOptions {
  workspace: WorkspaceState;
  getThread: () => ThreadSummary;
  parseRegistrationRepairInput: (params: Record<string, unknown>) => CapabilityBuilderRegistrationRepairInput;
  repairCapabilityBuilderRegistrationMetadata?: (
    workspacePath: string,
    input: CapabilityBuilderRegistrationRepairInput,
  ) => Promise<CapabilityBuilderRegistrationRepairResult> | CapabilityBuilderRegistrationRepairResult;
  capabilityBuilderRegistrationRepairText?: (result: CapabilityBuilderRegistrationRepairResult) => string;
  resolveFirstPartyPluginPermission: (input: CapabilityBuilderRegistrationRepairPermissionRequest) => Promise<boolean> | boolean;
  markPluginToolsStale: () => void;
}

export function registerCapabilityBuilderRegistrationRepairTool(
  pi: Pick<ExtensionAPI, "registerTool">,
  options: CapabilityBuilderRegistrationRepairToolRegistrationOptions,
): void {
  const { workspace } = options;
  const repairRegistration = options.repairCapabilityBuilderRegistrationMetadata ?? repairCapabilityBuilderRegistrationMetadata;
  const repairText = options.capabilityBuilderRegistrationRepairText ?? capabilityBuilderRegistrationRepairText;

  registerDesktopTool(pi, pluginInstallToolDescriptor("ambient_capability_builder_repair_registration_metadata"), {
    executionMode: "sequential",
    execute: async (_toolCallId, params, _signal, onUpdate?: ToolUpdateHandler) => {
      const thread = options.getThread();
      if (thread.collaborationMode === "planner") {
        throw new Error("Capability Builder registration metadata repair is blocked in Planner Mode.");
      }
      const input = options.parseRegistrationRepairInput(params as Record<string, unknown>);
      const packageTarget = input.packageName ?? input.sourcePath ?? input.path ?? "unknown";
      const detail = [
        `Workspace: ${workspace.path}`,
        `Package/source target: ${packageTarget}`,
        `Reason: ${input.reason ?? "not supplied"}`,
        "Effect: clears stale installedPackageId, installedSource, installedVersion, and refs.installed only when the installed Ambient CLI package is already absent.",
        "Preserved: managed builder source, package-local Git history, validation refs, validation logs, dependency logs, generated artifacts, env bindings, and secret metadata.",
        "No installed package files, builder source files, logs, artifacts, env bindings, secrets, validation, registration, or generated capability commands are changed in this step.",
        "Use this recovery path only when ambient_capability_builder_unregister cannot remove the installed package because the installed copy is already missing or stale.",
      ].join("\n");
      const allowed = await options.resolveFirstPartyPluginPermission({
        thread,
        workspace,
        toolName: "ambient_capability_builder_repair_registration_metadata",
        title: `Repair Capability Builder registration metadata for "${packageTarget}"?`,
        message: "Ambient wants to clear stale installed refs from Builder metadata while preserving source and artifacts.",
        detail,
        grantTargetLabel: `Repair registration metadata ${packageTarget}`,
        grantTargetIdentity: ["ambient_capability_builder_repair_registration_metadata", workspace.path, packageTarget].join("\0"),
        allowedReason: "Capability Builder registration metadata repair approved by Ambient permission grant policy.",
        deniedReason: "Capability Builder registration metadata repair prompt denied or timed out.",
      });
      if (!allowed) throw new Error("Capability Builder registration metadata repair blocked by approval prompt.");
      onUpdate?.({
        content: [{ type: "text", text: `Repairing Capability Builder registration metadata for "${packageTarget}".` }],
        details: {
          runtime: "ambient-capability-builder",
          toolName: "ambient_capability_builder_repair_registration_metadata",
          status: "repairing-registration-metadata",
          packageTarget,
        },
      });
      const result = await repairRegistration(workspace.path, input);
      options.markPluginToolsStale();
      return {
        content: [{ type: "text" as const, text: repairText(result) }],
        details: {
          runtime: "ambient-capability-builder",
          toolName: "ambient_capability_builder_repair_registration_metadata",
          status: "registration-metadata-repaired",
          packageName: result.packageName,
          rootPath: result.rootPath,
          relativeRootPath: result.relativeRootPath,
          gitSha: result.gitSha,
          repairedAt: result.repairedAt,
          staleInstalledPackageId: result.staleInstalledPackageId,
          staleInstalledSource: result.staleInstalledSource,
          staleInstalledRef: result.staleInstalledRef,
          installedPresent: result.installedPresent,
          changed: result.changed,
          availability: "next-session-refresh",
        },
      };
    },
  });
}
