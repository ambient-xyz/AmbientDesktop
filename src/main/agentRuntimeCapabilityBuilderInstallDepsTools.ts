import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

import type {
  PermissionGrantScopeKind,
  PermissionRisk,
  ThreadSummary,
  WorkspaceState,
} from "../shared/types";
import {
  capabilityBuilderDependencyRuntimeGuidance,
  capabilityBuilderInstallDepsOutputPreview,
  capabilityBuilderInstallDepsText,
  installCapabilityBuilderDependencies,
  previewCapabilityBuilderPackage,
  type CapabilityBuilderDependencyCommand,
  type CapabilityBuilderDependencyCommandResult,
  type CapabilityBuilderInstallDepsInput,
  type CapabilityBuilderInstallDepsResult,
  type CapabilityBuilderPreviewResult,
} from "./capabilityBuilder";
import { pluginInstallToolDescriptor } from "./desktopToolRegistry";
import { registerDesktopTool } from "./desktopToolRegistration";

type ToolUpdateHandler = (update: {
  content: Array<{ type: "text"; text: string }>;
  details: Record<string, unknown>;
}) => void;

export interface CapabilityBuilderInstallDepsPermissionRequest {
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

export interface CapabilityBuilderInstallDepsToolRegistrationOptions {
  workspace: WorkspaceState;
  getThread: () => ThreadSummary;
  parseInstallDepsInput: (params: Record<string, unknown>) => CapabilityBuilderInstallDepsInput;
  previewCapabilityBuilderPackage?: (
    workspacePath: string,
    input: CapabilityBuilderInstallDepsInput,
  ) => Promise<CapabilityBuilderPreviewResult> | CapabilityBuilderPreviewResult;
  installCapabilityBuilderDependencies?: (
    workspacePath: string,
    input: CapabilityBuilderInstallDepsInput,
  ) => Promise<CapabilityBuilderInstallDepsResult> | CapabilityBuilderInstallDepsResult;
  capabilityBuilderInstallDepsText?: (result: CapabilityBuilderInstallDepsResult) => string;
  capabilityBuilderInstallDepsOutputPreview?: (result: CapabilityBuilderInstallDepsResult) => unknown;
  capabilityBuilderDependencyRuntimeGuidance?: (
    commands: Array<Pick<CapabilityBuilderDependencyCommandResult, "command" | "args"> | CapabilityBuilderDependencyCommand>,
  ) => string[];
  resolveFirstPartyPluginPermission: (input: CapabilityBuilderInstallDepsPermissionRequest) => Promise<boolean> | boolean;
}

export function registerCapabilityBuilderInstallDepsTool(
  pi: Pick<ExtensionAPI, "registerTool">,
  options: CapabilityBuilderInstallDepsToolRegistrationOptions,
): void {
  const { workspace } = options;
  const previewPackage = options.previewCapabilityBuilderPackage ?? previewCapabilityBuilderPackage;
  const installDeps = options.installCapabilityBuilderDependencies ?? installCapabilityBuilderDependencies;
  const installDepsText = options.capabilityBuilderInstallDepsText ?? capabilityBuilderInstallDepsText;
  const outputPreview = options.capabilityBuilderInstallDepsOutputPreview ?? capabilityBuilderInstallDepsOutputPreview;
  const runtimeGuidanceForCommands = options.capabilityBuilderDependencyRuntimeGuidance ?? capabilityBuilderDependencyRuntimeGuidance;

  registerDesktopTool(pi, pluginInstallToolDescriptor("ambient_capability_builder_install_deps"), {
    executionMode: "sequential",
    execute: async (_toolCallId, params, _signal, onUpdate?: ToolUpdateHandler) => {
      const thread = options.getThread();
      if (thread.collaborationMode === "planner") throw new Error("Capability Builder dependency installation is blocked in Planner Mode.");
      const input = options.parseInstallDepsInput(params as Record<string, unknown>);
      const preview = await previewPackage(workspace.path, input);
      if (!preview.valid) throw new Error(`Capability package preview has errors: ${preview.errors.join("; ")}`);
      const commandLines = input.commands.map((command, index) => {
        const args = command.args ?? [];
        return `${index + 1}. ${[command.command, ...args].map((part) => JSON.stringify(part)).join(" ")}\n   cwd: ${command.cwd ?? "."}\n   rationale: ${command.rationale}`;
      });
      const runtimeGuidance = runtimeGuidanceForCommands(input.commands);
      const detail = [
        `Workspace: ${workspace.path}`,
        `Package: ${preview.packageName}`,
        `Managed root: ${preview.relativeRootPath}`,
        `Git SHA: ${preview.gitSha ?? "unavailable"}`,
        "Effect: runs the exact commands below without a shell and writes capability-deps-log.jsonl in the package root.",
        "Output policy: the result will include bounded stdout/stderr previews, actual output lengths, truncation flags, per-command durations, and total duration.",
        "No registration, activation, validation, or generated capability command execution happens in this step.",
        "",
        "Runtime guidance:",
        ...runtimeGuidance.map((note) => `- ${note}`),
        "",
        "Commands:",
        ...commandLines,
      ].join("\n");
      const allowed = await options.resolveFirstPartyPluginPermission({
        thread,
        workspace,
        toolName: "ambient_capability_builder_install_deps",
        title: `Run dependency commands for "${preview.packageName}"?`,
        message: "Ambient wants to run approved dependency/setup commands for a managed draft capability package.",
        detail,
        grantTargetLabel: `Install deps for ${preview.packageName}`,
        grantTargetIdentity: ["ambient_capability_builder_install_deps", workspace.path, preview.packageName, JSON.stringify(input.commands)].join("\0"),
        allowedReason: "Capability Builder dependency installation approved by Ambient permission grant policy.",
        deniedReason: "Capability Builder dependency installation prompt denied or timed out.",
      });
      if (!allowed) throw new Error("Capability Builder dependency installation blocked by approval prompt.");
      onUpdate?.({
        content: [{ type: "text", text: `Running dependency commands for Ambient capability "${preview.packageName}".` }],
        details: {
          runtime: "ambient-capability-builder",
          toolName: "ambient_capability_builder_install_deps",
          status: "running",
          packageName: preview.packageName,
          commandCount: input.commands.length,
        },
      });
      const result = await installDeps(workspace.path, input);
      return {
        content: [{ type: "text" as const, text: installDepsText(result) }],
        details: {
          runtime: "ambient-capability-builder",
          toolName: "ambient_capability_builder_install_deps",
          status: result.succeeded ? "succeeded" : "failed",
          packageName: result.packageName,
          rootPath: result.rootPath,
          relativeRootPath: result.relativeRootPath,
          gitSha: result.gitSha,
          logPath: result.logPath,
          relativeLogPath: result.relativeLogPath,
          commandCount: result.commands.length,
          durationMs: result.durationMs,
          commandDurationsMs: result.commands.map((command) => command.durationMs),
          startedAt: result.startedAt,
          completedAt: result.completedAt,
          largeOutputPreview: outputPreview(result),
        },
      };
    },
  });
}
