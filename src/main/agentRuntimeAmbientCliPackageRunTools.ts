import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

import type { PermissionGrantScopeKind, PermissionRisk, ThreadSummary, WorkspaceState } from "../shared/types";
import {
  describeAmbientCliPackage,
  discoverAmbientCliPackages,
  runAmbientCliPackageCommand,
  type AmbientCliPackageCatalog,
  type AmbientCliPackageDescription,
  type AmbientCliRunResult,
  type DescribeAmbientCliPackageInput,
  type DescribeAmbientCliPackageOptions,
  type RunAmbientCliInput,
} from "./ambientCliPackages";
import {
  ambientCliPreflightDescribeText,
  ambientCliRunApprovalDetail,
  ambientCliRunGrantIdentity,
  ambientCliRunInput,
  ambientCliRunText,
} from "./agentRuntimeAmbientCliPackageRunModel";
import { selectAmbientCliPackageForRuntime } from "./agentRuntimeAmbientCliPackageSelection";
import { pluginInstallToolDescriptor } from "./desktopToolRegistry";
import { registerDesktopTool } from "./desktopToolRegistration";
import { buildToolLongformInputPreview as defaultBuildToolLongformInputPreview } from "./toolLongformInputPreview";

export {
  ambientCliPreflightDescribeText,
  ambientCliRunText,
} from "./agentRuntimeAmbientCliPackageRunModel";

type ToolUpdateHandler = (update: {
  content: Array<{ type: "text"; text: string }>;
  details: Record<string, unknown>;
}) => void;

export interface AmbientCliRunPermissionRequest {
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

export interface AmbientCliRunToolRegistrationOptions {
  workspace: WorkspaceState;
  getThread: () => ThreadSummary;
  discoverAmbientCliPackages?: (workspacePath: string) => Promise<AmbientCliPackageCatalog> | AmbientCliPackageCatalog;
  describeAmbientCliPackage?: (
    workspacePath: string,
    input: DescribeAmbientCliPackageInput,
    options?: DescribeAmbientCliPackageOptions,
  ) => Promise<AmbientCliPackageDescription> | AmbientCliPackageDescription;
  runAmbientCliPackageCommand?: (workspacePath: string, input: RunAmbientCliInput) => Promise<AmbientCliRunResult> | AmbientCliRunResult;
  isAmbientCliPackageDescribed: (packageId: string, packageName: string) => boolean;
  markAmbientCliPackageDescribed: (packageId: string, packageName: string) => void;
  resolveFirstPartyPluginPermission: (input: AmbientCliRunPermissionRequest) => Promise<boolean> | boolean;
  modelComplete?: (prompt: string, signal?: AbortSignal) => Promise<string>;
  buildToolLongformInputPreview?: typeof defaultBuildToolLongformInputPreview;
  env?: Partial<Pick<NodeJS.ProcessEnv, "AMBIENT_CLI_RLM_SUMMARIES">>;
}

export function registerAmbientCliRunTool(
  pi: Pick<ExtensionAPI, "registerTool">,
  options: AmbientCliRunToolRegistrationOptions,
): void {
  const { workspace } = options;
  const discoverPackages = options.discoverAmbientCliPackages ?? discoverAmbientCliPackages;
  const describePackage = options.describeAmbientCliPackage ?? describeAmbientCliPackage;
  const runPackageCommand = options.runAmbientCliPackageCommand ?? runAmbientCliPackageCommand;
  const buildLongformInputPreview = options.buildToolLongformInputPreview ?? defaultBuildToolLongformInputPreview;
  const env = options.env ?? process.env;

  registerDesktopTool(pi, pluginInstallToolDescriptor("ambient_cli"), {
    executionMode: "sequential",
    execute: async (_toolCallId, params, signal, onUpdate?: ToolUpdateHandler) => {
      const thread = options.getThread();
      const input = ambientCliRunInput(params as Record<string, unknown>);
      const catalog = await discoverPackages(workspace.path);
      const pkg = selectAmbientCliPackageForRuntime(catalog.packages, input);
      const registeredCommand = pkg.commands.find((item) => item.name === input.command);
      if (!registeredCommand) throw new Error(`Ambient CLI package "${pkg.name}" does not declare command "${input.command}".`);
      const cliLongformInputPreview = buildLongformInputPreview("ambient_cli", {
        ...(input.packageId ? { packageId: input.packageId } : {}),
        packageName: pkg.name,
        command: input.command,
        ...(input.args ? { args: input.args } : {}),
        ...(input.cwd ? { cwd: input.cwd } : {}),
      });
      if (!options.isAmbientCliPackageDescribed(pkg.id, pkg.name)) {
        const generateMissingSummaries = env.AMBIENT_CLI_RLM_SUMMARIES === "1";
        const result = await describePackage(
          workspace.path,
          {
            ...(input.packageId ? { packageId: input.packageId } : {}),
            packageName: pkg.name,
            command: input.command,
          },
          {
            generateMissingSummaries,
            signal,
            ...(generateMissingSummaries && options.modelComplete
              ? {
                modelComplete: options.modelComplete,
              }
              : {}),
          },
        );
        options.markAmbientCliPackageDescribed(result.package.id, result.package.name);
        return {
          content: [
            {
              type: "text" as const,
              text: ambientCliPreflightDescribeText(result),
            },
          ],
          details: {
            runtime: "ambient-cli",
            toolName: "ambient_cli",
            packageId: pkg.id,
            packageName: pkg.name,
            commandName: input.command,
            status: "preflight-description",
            executed: false,
            commandNames: result.commands.map((item) => item.name),
            skillCount: result.skills.length,
            includedSkillText: result.skills.some((skill) => Boolean(skill.text)),
            generatedSummary: generateMissingSummaries,
            summaryStatuses: result.skills.map((skill) => skill.summaryStatus),
            missingEnv: result.env.filter((env) => env.required && !env.configured).map((env) => env.name),
            ...(cliLongformInputPreview ? { toolLongformInputPreview: cliLongformInputPreview } : {}),
          },
        };
      }
      const detail = ambientCliRunApprovalDetail({
        workspace,
        pkg,
        commandName: input.command,
        args: input.args,
        cwd: input.cwd,
      });
      const allowed = await options.resolveFirstPartyPluginPermission({
        thread,
        workspace,
        toolName: "ambient_cli",
        title: `Run Ambient CLI "${pkg.name}:${input.command}"?`,
        message: "Ambient wants to run a command declared by an installed CLI package.",
        detail,
        grantTargetLabel: `Run Ambient CLI ${pkg.name}:${input.command}`,
        grantTargetIdentity: ambientCliRunGrantIdentity({
          pkg,
          commandName: input.command,
          registeredCommand,
          cwd: input.cwd,
        }),
        allowedReason: "Ambient CLI execution approved by Ambient permission grant policy.",
        deniedReason: "Ambient CLI execution prompt denied or timed out.",
      });
      if (!allowed) throw new Error("Ambient CLI execution blocked by approval prompt.");
      onUpdate?.({
        content: [{ type: "text", text: `Running Ambient CLI "${pkg.name}:${input.command}".` }],
        details: {
          runtime: "ambient-cli",
          toolName: "ambient_cli",
          packageId: pkg.id,
          packageName: pkg.name,
          command: input.command,
          status: "running",
          ...(cliLongformInputPreview ? { toolLongformInputPreview: cliLongformInputPreview } : {}),
        },
      });
      const result = await runPackageCommand(workspace.path, {
        packageId: pkg.id,
        command: input.command,
        args: input.args,
        ...(input.cwd ? { cwd: input.cwd } : {}),
      });
      return {
        content: [{ type: "text" as const, text: ambientCliRunText(result) }],
        details: {
          runtime: "ambient-cli",
          toolName: "ambient_cli",
          packageId: result.packageId,
          packageName: result.packageName,
          commandName: result.commandName,
          cwd: result.cwd,
          durationMs: result.durationMs,
          ...(result.stdoutOutput ? { stdoutOutput: result.stdoutOutput } : {}),
          ...(result.stderrOutput ? { stderrOutput: result.stderrOutput } : {}),
          ...(cliLongformInputPreview ? { toolLongformInputPreview: cliLongformInputPreview } : {}),
        },
      };
    },
  });
}
