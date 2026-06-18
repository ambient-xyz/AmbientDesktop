import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

import type { PermissionGrantScopeKind, PermissionRisk } from "../../shared/permissionTypes";
import type { ThreadSummary } from "../../shared/threadTypes";
import type { WorkspaceState } from "../../shared/workspaceTypes";
import {
  capabilityBuilderWriteFileText,
  previewCapabilityBuilderPackage,
  writeCapabilityBuilderFile,
  type CapabilityBuilderPreviewResult,
  type CapabilityBuilderWriteFileInput,
  type CapabilityBuilderWriteFileResult,
} from "./capabilityBuilder";
import { pluginInstallToolDescriptor } from "../desktop-tools/desktopToolRegistry";
import { registerDesktopTool } from "../desktop-tools/desktopToolRegistration";

type ToolUpdateHandler = (update: {
  content: Array<{ type: "text"; text: string }>;
  details: Record<string, unknown>;
}) => void;

export interface CapabilityBuilderWriteFilePermissionRequest {
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

export interface CapabilityBuilderWriteFileToolRegistrationOptions {
  workspace: WorkspaceState;
  getThread: () => ThreadSummary;
  parseWriteFileInput: (params: Record<string, unknown>) => CapabilityBuilderWriteFileInput;
  previewCapabilityBuilderPackage?: (
    workspacePath: string,
    input: CapabilityBuilderWriteFileInput,
  ) => Promise<CapabilityBuilderPreviewResult> | CapabilityBuilderPreviewResult;
  writeCapabilityBuilderFile?: (
    workspacePath: string,
    input: CapabilityBuilderWriteFileInput,
  ) => Promise<CapabilityBuilderWriteFileResult> | CapabilityBuilderWriteFileResult;
  resolveFirstPartyPluginPermission: (input: CapabilityBuilderWriteFilePermissionRequest) => Promise<boolean> | boolean;
  markPluginToolsStale: () => void;
}

export function registerCapabilityBuilderWriteFileTool(
  pi: Pick<ExtensionAPI, "registerTool">,
  options: CapabilityBuilderWriteFileToolRegistrationOptions,
): void {
  const { workspace } = options;
  const previewPackage = options.previewCapabilityBuilderPackage ?? previewCapabilityBuilderPackage;
  const writeFile = options.writeCapabilityBuilderFile ?? writeCapabilityBuilderFile;

  registerDesktopTool(pi, pluginInstallToolDescriptor("ambient_capability_builder_write_file"), {
    executionMode: "sequential",
    execute: async (_toolCallId, params, _signal, onUpdate?: ToolUpdateHandler) => {
      const thread = options.getThread();
      if (thread.collaborationMode === "planner") throw new Error("Capability Builder file writes are blocked in Planner Mode.");
      const input = options.parseWriteFileInput(params as Record<string, unknown>);
      const preview = await previewPackage(workspace.path, input);
      const detail = [
        `Workspace: ${workspace.path}`,
        `Package: ${preview.packageName}`,
        `Managed root: ${preview.relativeRootPath}`,
        `Git SHA: ${preview.gitSha ?? "unavailable"}`,
        `File: ${input.filePath}`,
        `Bytes: ${Buffer.byteLength(input.content, "utf8")}`,
        `Reason: ${input.reason}`,
        "Effect: creates or replaces exactly one UTF-8 text file inside the managed package source.",
        "No dependency installation, validation, registration, activation, installed package mutation, generated command execution, log deletion, artifact deletion, or env/secret change happens in this step.",
      ].join("\n");
      const allowed = await options.resolveFirstPartyPluginPermission({
        thread,
        workspace,
        toolName: "ambient_capability_builder_write_file",
        title: `Write ${input.filePath} in "${preview.packageName}"?`,
        message: "Ambient wants to write one file in a managed generated capability package.",
        detail,
        grantTargetLabel: `Write ${input.filePath} for ${preview.packageName}`,
        grantTargetIdentity: ["ambient_capability_builder_write_file", workspace.path, preview.packageName, input.filePath].join("\0"),
        allowedReason: "Capability Builder file write approved by Ambient permission grant policy.",
        deniedReason: "Capability Builder file write prompt denied or timed out.",
      });
      if (!allowed) throw new Error("Capability Builder file write blocked by approval prompt.");
      onUpdate?.({
        content: [{ type: "text", text: `Writing ${input.filePath} for Ambient capability "${preview.packageName}".` }],
        details: {
          runtime: "ambient-capability-builder",
          toolName: "ambient_capability_builder_write_file",
          status: "writing",
          packageName: preview.packageName,
          filePath: input.filePath,
        },
      });
      const result = await writeFile(workspace.path, input);
      options.markPluginToolsStale();
      return {
        content: [{ type: "text" as const, text: capabilityBuilderWriteFileText(result) }],
        details: {
          runtime: "ambient-capability-builder",
          toolName: "ambient_capability_builder_write_file",
          status: "written",
          packageName: result.packageName,
          rootPath: result.rootPath,
          relativeRootPath: result.relativeRootPath,
          sourceRef: result.sourceRef,
          filePath: result.filePath,
          sizeBytes: result.sizeBytes,
          created: result.created,
          gitSha: result.gitSha,
        },
      };
    },
  });
}
