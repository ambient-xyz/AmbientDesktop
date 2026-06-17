import { existsSync, readFileSync, statSync } from "node:fs";
import { basename, dirname, isAbsolute, join, resolve } from "node:path";
import type { AgentToolResult, ExtensionAPI } from "@mariozechner/pi-coding-agent";

import type { WorkspaceState } from "../../../shared/types";
import type { CodexPluginInstallPreview } from "../codex/codexPlugins";
import {
  installRouteToolDescriptor,
  pluginInstallToolDescriptor,
} from "../../desktopToolRegistry";
import { registerDesktopTool } from "../../desktopToolRegistration";
import { discoverAmbientCliPackages } from "../../ambient-cli/ambientCliPackages";
import {
  ambientInstallRoutePlanInput,
  ambientInstallRoutePlanText,
  ambientInstallRouteSummary,
  ambientInstallRouteTelemetry,
  planAmbientInstallRoute,
  type AmbientInstallRoutePlan,
} from "../../install-route/installRoutePlanner";
import {
  runSetupRuntimePreflight,
  setupRuntimePreflightText,
  type SetupRuntimePackageManagerChoice,
  type SetupRuntimePreflightResult,
} from "../../setup/setupRuntimePreflight";
import {
  describeSetupRecipe,
  setupRecipeDescribeText,
  type SetupRecipeDescribeResult,
  type SetupRecipeId,
} from "../../setup/setupRecipeService";

type ToolUpdateHandler = (update: AgentToolResult<Record<string, unknown>>) => void;

interface PluginInstallReadOnlyToolBaseOptions {
  workspace: Pick<WorkspaceState, "path">;
}

export interface PluginInstallPlanningToolRegistrationOptions extends PluginInstallReadOnlyToolBaseOptions {
  recordInstallRoutePlan: (plan: AmbientInstallRoutePlan) => void;
  discoverAmbientCliPackages?: typeof discoverAmbientCliPackages;
  runSetupRuntimePreflight?: typeof runSetupRuntimePreflight;
  describeSetupRecipe?: typeof describeSetupRecipe;
}

export interface PluginInstallPreviewToolRegistrationOptions extends PluginInstallReadOnlyToolBaseOptions {
  previewCodexPluginInstall: (
    workspacePath: string,
    input: { source: string; name?: string },
  ) => Promise<CodexPluginInstallPreview> | CodexPluginInstallPreview;
}

export function registerPluginInstallPlanningTools(
  pi: Pick<ExtensionAPI, "registerTool">,
  options: PluginInstallPlanningToolRegistrationOptions,
): void {
  const { workspace } = options;

  registerDesktopTool(pi, installRouteToolDescriptor("ambient_install_route_plan"), {
    executionMode: "sequential",
    execute: async (_toolCallId, params) => {
      const input = ambientInstallRoutePlanInput(params);
      let installedAmbientCliPackages: Array<{ name: string; commands?: string[]; skills?: string[] }> = [];
      try {
        const catalog = await (options.discoverAmbientCliPackages ?? discoverAmbientCliPackages)(workspace.path);
        installedAmbientCliPackages = catalog.packages.map((pkg) => ({
          name: pkg.name,
          commands: pkg.commands.map((command) => command.name),
          skills: pkg.skills.map((skill) => skill.name),
        }));
      } catch {
        installedAmbientCliPackages = [];
      }
      const localSourceKinds = input.localPath
        ? {
            [input.localPath]: inspectInstallRouteLocalSourceKind(workspace.path, input.localPath),
          }
        : undefined;
      const plan = planAmbientInstallRoute(input, {
        installedAmbientCliPackages,
        ...(localSourceKinds ? { localSourceKinds } : {}),
      });
      options.recordInstallRoutePlan(plan);
      return {
        content: [{ type: "text" as const, text: ambientInstallRoutePlanText(plan) }],
        details: {
          runtime: "ambient-install-route",
          toolName: "ambient_install_route_plan",
          status: "planned",
          lane: plan.lane,
          confidence: plan.confidence,
          approvalBoundary: plan.approvalBoundary,
          nextTools: plan.nextTools.map((tool) => tool.name),
          blockerCount: plan.blockers.length,
          warningCount: plan.warnings.length,
          installRouteSummary: ambientInstallRouteSummary(plan),
          installRouteTelemetry: ambientInstallRouteTelemetry(plan),
        },
      };
    },
  });

  registerDesktopTool(pi, pluginInstallToolDescriptor("ambient_setup_runtime_preflight"), {
    executionMode: "sequential",
    execute: async (_toolCallId, params, _signal, onUpdate?: ToolUpdateHandler) => {
      const input = params as Record<string, unknown>;
      const packageManager = optionalSetupRuntimePackageManager(input.packageManager);
      onUpdate?.({
        content: [{ type: "text", text: "Inspecting setup runtime, package manager, and architecture." }],
        details: {
          runtime: "ambient-setup-runtime-preflight",
          toolName: "ambient_setup_runtime_preflight",
          status: "running",
          workspacePath: workspace.path,
          packageManager: packageManager ?? "auto",
        },
      });
      const result = await (options.runSetupRuntimePreflight ?? runSetupRuntimePreflight)({
        workspacePath: workspace.path,
        ...(packageManager ? { packageManager } : {}),
      });
      return setupRuntimePreflightToolResult(workspace.path, result);
    },
  });

  registerDesktopTool(pi, pluginInstallToolDescriptor("ambient_setup_recipe_describe"), {
    executionMode: "sequential",
    execute: async (_toolCallId, params, _signal, onUpdate?: ToolUpdateHandler) => {
      const input = params as Record<string, unknown>;
      const recipe = requiredSetupRecipeId(input.recipe);
      const includeHostPreflight = optionalBoolean(input.includeHostPreflight);
      const includePortProbe = optionalBoolean(input.includePortProbe);
      onUpdate?.({
        content: [{ type: "text", text: `Inspecting ${recipe} setup recipe, container files, host runtime, and port conflicts.` }],
        details: {
          runtime: "ambient-setup-recipe-describe",
          toolName: "ambient_setup_recipe_describe",
          status: "running",
          workspacePath: workspace.path,
          recipe,
        },
      });
      const result = await (options.describeSetupRecipe ?? describeSetupRecipe)({
        workspacePath: workspace.path,
        recipe,
        ...(includeHostPreflight !== undefined ? { includeHostPreflight } : {}),
        ...(includePortProbe !== undefined ? { includePortProbe } : {}),
      });
      return setupRecipeDescribeToolResult(workspace.path, recipe, result);
    },
  });
}

export function registerPluginInstallPreviewTool(
  pi: Pick<ExtensionAPI, "registerTool">,
  options: PluginInstallPreviewToolRegistrationOptions,
): void {
  const { workspace } = options;

  registerDesktopTool(pi, pluginInstallToolDescriptor("ambient_plugin_install_preview"), {
    executionMode: "sequential",
    execute: async (_toolCallId, params, _signal, onUpdate?: ToolUpdateHandler) => {
      const input = params as Record<string, unknown>;
      const source = requiredString(input, "source");
      const name = optionalString(input.name);
      onUpdate?.({
        content: [{ type: "text", text: `Inspecting plugin install source ${source}.` }],
        details: {
          runtime: "ambient-plugin-install",
          toolName: "ambient_plugin_install_preview",
          status: "running",
          source,
        },
      });
      const result = await options.previewCodexPluginInstall(workspace.path, { source, ...(name ? { name } : {}) });
      return {
        content: [{ type: "text" as const, text: pluginInstallPreviewText(result) }],
        details: {
          runtime: "ambient-plugin-install",
          toolName: "ambient_plugin_install_preview",
          source,
          marketplaceSourceCount: result.marketplaceSources.length,
          candidateCount: result.candidates.length,
          installableCount: result.installableCount,
          errorCount: result.errors.length,
        },
      };
    },
  });
}

export function pluginInstallPreviewText(preview: CodexPluginInstallPreview): string {
  const lines = [
    "Plugin install preview",
    `Source: ${preview.source}`,
    `Marketplace sources: ${preview.marketplaceSources.length}`,
    `Candidates: ${preview.candidates.length}`,
    `Installable now: ${preview.installableCount}`,
  ];
  for (const source of preview.marketplaceSources.slice(0, 5)) {
    lines.push(`- Source ${source.label}: ${source.kind}, ${source.pluginCount ?? 0} plugins${source.contentChecksum ? `, checksum ${source.contentChecksum}` : ""}`);
  }
  for (const candidate of preview.candidates.slice(0, 10)) {
    const pins = [candidate.sourceRef ? `ref ${candidate.sourceRef}` : undefined, candidate.sourceSha ? `sha ${candidate.sourceSha}` : undefined]
      .filter(Boolean)
      .join(", ");
    const capabilities = [
      candidate.skills.length ? `${candidate.skills.length} skills` : undefined,
      candidate.mcpServers.length ? `${candidate.mcpServers.length} MCP servers` : undefined,
      candidate.apps?.length ? `${candidate.apps.length} apps` : undefined,
    ]
      .filter(Boolean)
      .join(", ");
    lines.push(
      [
        `- ${candidate.displayName ?? candidate.name}`,
        candidate.version && candidate.version !== "remote" ? `version ${candidate.version}` : undefined,
        candidate.compatibilityTier,
        candidate.imported ? "already imported" : candidate.updateAvailable ? "update available" : "not imported",
        pins || "unpinned",
        capabilities || "metadata only",
        candidate.dependencyStatus?.required && !candidate.dependencyStatus.installed ? "dependencies missing" : undefined,
      ]
        .filter(Boolean)
        .join("; "),
    );
  }
  for (const error of preview.errors.slice(0, 8)) lines.push(`Error: ${error}`);
  if (preview.candidates.length > 10) lines.push(`Additional candidates omitted: ${preview.candidates.length - 10}`);
  if (preview.errors.length > 8) lines.push(`Additional errors omitted: ${preview.errors.length - 8}`);
  return lines.join("\n");
}

function setupRuntimePreflightToolResult(workspacePath: string, result: SetupRuntimePreflightResult): AgentToolResult<Record<string, unknown>> {
  return {
    content: [{ type: "text", text: setupRuntimePreflightText(result) }],
    details: {
      runtime: "ambient-setup-runtime-preflight",
      toolName: "ambient_setup_runtime_preflight",
      status: "complete",
      workspacePath,
      hostPlatform: result.host.platform,
      hostMachineArch: result.host.machineArch,
      ambientProcessArch: result.ambientProcess.arch,
      projectNodeArch: result.projectNode.arch,
      selectedPackageManager: result.selectedPackageManager?.name,
      selectedPackageManagerPath: result.selectedPackageManager?.path,
      selectedPackageManagerArch: result.selectedPackageManager?.architecture,
      nativeDependencySignals: result.packageMetadata.nativeDependencySignals,
      nativeScriptSignals: result.packageMetadata.nativeScriptSignals,
      warnings: result.warnings,
    },
  };
}

function setupRecipeDescribeToolResult(
  workspacePath: string,
  recipe: SetupRecipeId,
  result: SetupRecipeDescribeResult,
): AgentToolResult<Record<string, unknown>> {
  return {
    content: [{ type: "text", text: setupRecipeDescribeText(result) }],
    details: {
      runtime: "ambient-setup-recipe-describe",
      toolName: "ambient_setup_recipe_describe",
      status: "complete",
      workspacePath,
      recipe,
      active: result.activation.active,
      confidence: result.activation.confidence,
      signalCount: result.activation.signals.length,
      containerFiles: result.containerFiles.map((file) => file.path),
      packageScripts: result.packageScripts.map((script) => script.name),
      publishedHostPorts: result.portBindings.map((binding) => binding.hostPort).filter(Boolean),
      portConflicts: result.portConflicts,
      hostStatuses: result.hostPreflight.map((host) => ({ kind: host.kind, status: host.status })),
      composeCommands: result.composeCommands.map((probe) => ({
        command: [probe.command, ...probe.args].join(" "),
        available: probe.available,
      })),
      existingContainerCount: result.existingContainers.length,
      warnings: result.warnings,
    },
  };
}

function requiredString(input: Record<string, unknown>, key: string): string {
  const value = input[key];
  if (typeof value !== "string" || !value.trim()) throw new Error(`${key} is required.`);
  return value;
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

function optionalSetupRuntimePackageManager(value: unknown): SetupRuntimePackageManagerChoice | undefined {
  const parsed = optionalString(value);
  if (!parsed || parsed === "auto") return undefined;
  if (parsed === "npm" || parsed === "pnpm" || parsed === "yarn" || parsed === "bun") return parsed;
  throw new Error("packageManager must be auto, npm, pnpm, yarn, or bun.");
}

function requiredSetupRecipeId(value: unknown): SetupRecipeId {
  const parsed = optionalString(value);
  if (parsed === "containerized_app") return parsed;
  throw new Error("recipe must be containerized_app.");
}

function optionalBoolean(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

function inspectInstallRouteLocalSourceKind(
  workspacePath: string,
  rawLocalPath: string,
): "ambient-cli-package" | "codex-plugin" | "unknown" {
  try {
    const target = isAbsolute(rawLocalPath) ? rawLocalPath : resolve(workspacePath, rawLocalPath);
    if (!existsSync(target)) return "unknown";
    const stat = statSync(target);
    const root = stat.isDirectory() ? target : dirname(target);
    if (existsSync(join(root, "ambient-cli.json"))) return "ambient-cli-package";
    if (existsSync(join(root, ".codex-plugin", "plugin.json"))) return "codex-plugin";
    if (basename(target) === "marketplace.json" || existsSync(join(root, "marketplace.json"))) return "codex-plugin";
    const packageJsonPath = stat.isDirectory() ? join(root, "package.json") : basename(target) === "package.json" ? target : undefined;
    if (packageJsonPath && existsSync(packageJsonPath)) {
      const parsed = JSON.parse(readFileSync(packageJsonPath, "utf8")) as Record<string, unknown>;
      const ambient = parsed.ambient;
      if (ambient && typeof ambient === "object" && (ambient as Record<string, unknown>).cli) return "ambient-cli-package";
      if (parsed.codexPlugin || parsed.codex || parsed.plugin) return "codex-plugin";
    }
  } catch {
    return "unknown";
  }
  return "unknown";
}
