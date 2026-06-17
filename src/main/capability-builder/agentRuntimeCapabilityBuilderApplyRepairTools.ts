import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

import type {
  PermissionGrantScopeKind,
  PermissionRisk,
  ThreadSummary,
  WorkspaceState,
} from "../../shared/types";
import {
  applyCapabilityBuilderRepair,
  capabilityBuilderApplyRepairText,
  previewCapabilityBuilderPackage,
  type CapabilityBuilderApplyRepairInput,
  type CapabilityBuilderApplyRepairResult,
  type CapabilityBuilderPreviewResult,
} from "./capabilityBuilder";
import { pluginInstallToolDescriptor } from "../desktopToolRegistry";
import { registerDesktopTool } from "../desktopToolRegistration";

type ToolUpdateHandler = (update: {
  content: Array<{ type: "text"; text: string }>;
  details: Record<string, unknown>;
}) => void;

export interface CapabilityBuilderApplyRepairPermissionRequest {
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

export interface CapabilityBuilderApplyRepairToolRegistrationOptions {
  workspace: WorkspaceState;
  getThread: () => ThreadSummary;
  parseApplyRepairInput: (params: Record<string, unknown>) => CapabilityBuilderApplyRepairInput;
  previewCapabilityBuilderPackage?: (
    workspacePath: string,
    input: CapabilityBuilderApplyRepairInput,
  ) => Promise<CapabilityBuilderPreviewResult> | CapabilityBuilderPreviewResult;
  applyCapabilityBuilderRepair?: (
    workspacePath: string,
    input: CapabilityBuilderApplyRepairInput,
  ) => Promise<CapabilityBuilderApplyRepairResult> | CapabilityBuilderApplyRepairResult;
  capabilityBuilderApplyRepairText?: (result: CapabilityBuilderApplyRepairResult) => string;
  resolveFirstPartyPluginPermission: (input: CapabilityBuilderApplyRepairPermissionRequest) => Promise<boolean> | boolean;
}

export function registerCapabilityBuilderApplyRepairTool(
  pi: Pick<ExtensionAPI, "registerTool">,
  options: CapabilityBuilderApplyRepairToolRegistrationOptions,
): void {
  const { workspace } = options;
  const previewPackage = options.previewCapabilityBuilderPackage ?? previewCapabilityBuilderPackage;
  const applyRepair = options.applyCapabilityBuilderRepair ?? applyCapabilityBuilderRepair;
  const applyRepairText = options.capabilityBuilderApplyRepairText ?? capabilityBuilderApplyRepairText;

  registerDesktopTool(pi, pluginInstallToolDescriptor("ambient_capability_builder_apply_repair"), {
    executionMode: "sequential",
    execute: async (_toolCallId, params, _signal, onUpdate?: ToolUpdateHandler) => {
      const thread = options.getThread();
      if (thread.collaborationMode === "planner") throw new Error("Capability Builder repair application is blocked in Planner Mode.");
      const input = options.parseApplyRepairInput(params as Record<string, unknown>);
      const preview = await previewPackage(workspace.path, input);
      const fileLines = input.files.map((file, index) => {
        return `${index + 1}. ${file.path}\n   bytes: ${Buffer.byteLength(file.content, "utf8")}\n   rationale: ${file.rationale}`;
      });
      const detail = [
        `Workspace: ${workspace.path}`,
        `Package: ${preview.packageName}`,
        `Managed root: ${preview.relativeRootPath}`,
        `Git SHA: ${preview.gitSha ?? "unavailable"}`,
        `Reason: ${input.reason}`,
        "Effect: writes only the exact UTF-8 text files below inside the managed package root.",
        "This clears prior validation metadata so the package must be previewed and validated again before registration.",
        "No dependency installation, validation, registration, activation, installed package mutation, generated command execution, log deletion, artifact deletion, or env/secret change happens in this step.",
        "",
        "Files:",
        ...fileLines,
      ].join("\n");
      const allowed = await options.resolveFirstPartyPluginPermission({
        thread,
        workspace,
        toolName: "ambient_capability_builder_apply_repair",
        title: `Apply repair edits to "${preview.packageName}"?`,
        message: "Ambient wants to write approved repair files for a managed generated capability package.",
        detail,
        grantTargetLabel: `Apply repair for ${preview.packageName}`,
        grantTargetIdentity: ["ambient_capability_builder_apply_repair", workspace.path, preview.packageName, JSON.stringify(input.files.map((file) => file.path))].join("\0"),
        allowedReason: "Capability Builder repair application approved by Ambient permission grant policy.",
        deniedReason: "Capability Builder repair application prompt denied or timed out.",
      });
      if (!allowed) throw new Error("Capability Builder repair application blocked by approval prompt.");
      onUpdate?.({
        content: [{ type: "text", text: `Applying approved repair edits for Ambient capability "${preview.packageName}".` }],
        details: {
          runtime: "ambient-capability-builder",
          toolName: "ambient_capability_builder_apply_repair",
          status: "applying",
          packageName: preview.packageName,
          fileCount: input.files.length,
        },
      });
      const result = await applyRepair(workspace.path, input);
      return {
        content: [{ type: "text" as const, text: applyRepairText(result) }],
        details: {
          runtime: "ambient-capability-builder",
          toolName: "ambient_capability_builder_apply_repair",
          status: "applied",
          packageName: result.packageName,
          rootPath: result.rootPath,
          relativeRootPath: result.relativeRootPath,
          gitSha: result.gitSha,
          repairGitSha: result.repairGitSha,
          repairedAt: result.repairedAt,
          fileCount: result.files.length,
          validationInvalidated: true,
        },
      };
    },
  });
}
