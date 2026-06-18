import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

import type { WorkspaceState } from "../../shared/workspaceTypes";
import {
  capabilityBuilderListFilesText,
  capabilityBuilderPreviewText,
  capabilityBuilderReadFileText,
  listCapabilityBuilderFiles,
  previewCapabilityBuilderPackage,
  readCapabilityBuilderFile,
  type CapabilityBuilderListFilesInput,
  type CapabilityBuilderListFilesResult,
  type CapabilityBuilderPreviewInput,
  type CapabilityBuilderPreviewResult,
  type CapabilityBuilderReadFileInput,
  type CapabilityBuilderReadFileResult,
} from "./capabilityBuilder";
import { pluginInstallToolDescriptor, registerDesktopTool } from "./capabilityBuilderDesktopToolFacade";

export interface CapabilityBuilderInspectionToolRegistrationOptions {
  workspace: Pick<WorkspaceState, "path">;
  parsePreviewInput: (params: Record<string, unknown>) => CapabilityBuilderPreviewInput;
  parseListFilesInput: (params: Record<string, unknown>) => CapabilityBuilderListFilesInput;
  parseReadFileInput: (params: Record<string, unknown>) => CapabilityBuilderReadFileInput;
  previewCapabilityBuilderPackage?: typeof previewCapabilityBuilderPackage;
  listCapabilityBuilderFiles?: typeof listCapabilityBuilderFiles;
  readCapabilityBuilderFile?: typeof readCapabilityBuilderFile;
}

export function registerCapabilityBuilderInspectionTools(
  pi: Pick<ExtensionAPI, "registerTool">,
  options: CapabilityBuilderInspectionToolRegistrationOptions,
): void {
  const { workspace } = options;
  const previewPackage = options.previewCapabilityBuilderPackage ?? previewCapabilityBuilderPackage;
  const listFiles = options.listCapabilityBuilderFiles ?? listCapabilityBuilderFiles;
  const readFile = options.readCapabilityBuilderFile ?? readCapabilityBuilderFile;

  registerDesktopTool(pi, pluginInstallToolDescriptor("ambient_capability_builder_preview"), {
    executionMode: "sequential",
    execute: async (_toolCallId, params) => {
      const input = options.parsePreviewInput(params as Record<string, unknown>);
      const result = await previewPackage(workspace.path, input);
      return capabilityBuilderPreviewToolResult(result);
    },
  });

  registerDesktopTool(pi, pluginInstallToolDescriptor("ambient_capability_builder_list_files"), {
    executionMode: "sequential",
    execute: async (_toolCallId, params) => {
      const input = options.parseListFilesInput(params as Record<string, unknown>);
      const result = await listFiles(workspace.path, input);
      return capabilityBuilderListFilesToolResult(result);
    },
  });

  registerDesktopTool(pi, pluginInstallToolDescriptor("ambient_capability_builder_read_file"), {
    executionMode: "sequential",
    execute: async (_toolCallId, params) => {
      const input = options.parseReadFileInput(params as Record<string, unknown>);
      const result = await readFile(workspace.path, input);
      return capabilityBuilderReadFileToolResult(result);
    },
  });
}

function capabilityBuilderPreviewToolResult(result: CapabilityBuilderPreviewResult) {
  return {
    content: [{ type: "text" as const, text: capabilityBuilderPreviewText(result) }],
    details: {
      runtime: "ambient-capability-builder",
      toolName: "ambient_capability_builder_preview",
      status: result.valid ? "valid" : "invalid",
      packageName: result.packageName,
      rootPath: result.rootPath,
      relativeRootPath: result.relativeRootPath,
      gitSha: result.gitSha,
      errorCount: result.errors.length,
      warningCount: result.warnings.length,
      riskCount: result.risks.length,
      commandNames: result.descriptor?.commandNames ?? [],
      envNames: result.descriptor?.envNames ?? [],
      artifactOutputTypes: result.descriptor?.artifactOutputTypes ?? [],
    },
  };
}

function capabilityBuilderListFilesToolResult(result: CapabilityBuilderListFilesResult) {
  return {
    content: [{ type: "text" as const, text: capabilityBuilderListFilesText(result) }],
    details: {
      runtime: "ambient-capability-builder",
      toolName: "ambient_capability_builder_list_files",
      status: "listed",
      packageName: result.packageName,
      rootPath: result.rootPath,
      relativeRootPath: result.relativeRootPath,
      sourceRef: result.sourceRef,
      fileCount: result.files.length,
    },
  };
}

function capabilityBuilderReadFileToolResult(result: CapabilityBuilderReadFileResult) {
  return {
    content: [{ type: "text" as const, text: capabilityBuilderReadFileText(result) }],
    details: {
      runtime: "ambient-capability-builder",
      toolName: "ambient_capability_builder_read_file",
      status: "read",
      packageName: result.packageName,
      rootPath: result.rootPath,
      relativeRootPath: result.relativeRootPath,
      sourceRef: result.sourceRef,
      filePath: result.filePath,
      sizeBytes: result.sizeBytes,
      truncated: result.truncated,
    },
  };
}
