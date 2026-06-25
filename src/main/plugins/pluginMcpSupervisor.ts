import type {
  CodexPluginMcpInspectionCatalog,
  CodexPluginMcpServerInspection,
  CodexPluginMcpTool,
  CodexPluginSummary,
  PluginMcpRuntimeSnapshot,
  PluginMcpRuntimeStatus,
} from "../../shared/pluginTypes";
import type { PermissionMode } from "../../shared/permissionTypes";
import {
  PluginMcpRuntimeManager,
  resolvePluginMcpOptions,
  startRuntimeEvent,
  truncate,
  type PluginMcpLaunchPlan,
  type ResolvedPluginMcpOptions,
} from "./pluginMcpRuntimeManager";
import { pluginMcpToolDescriptor, type DesktopToolDescriptor } from "./pluginsDesktopToolFacade";
import { redactSensitiveText } from "./pluginsSecurityFacade";
import { materializeTextOutput, materializedTextNotice, type MaterializedTextOutput } from "./pluginsToolRuntimeFacade";

export type { PluginMcpRuntimeSnapshot, PluginMcpRuntimeStatus };
export type { PluginMcpLaunchPlan } from "./pluginMcpRuntimeManager";
const pluginMcpResultPreviewChars = 12_000;

export interface PluginMcpToolRegistration {
  registeredName: string;
  originalName: string;
  label: string;
  description: string;
  promptSnippet: string;
  promptGuidelines: string[];
  parameters: unknown;
  descriptor: DesktopToolDescriptor;
  launchPlan: PluginMcpLaunchPlan;
  tool: CodexPluginMcpTool;
}

export interface PluginMcpToolInvocation {
  toolName: string;
  arguments?: Record<string, unknown>;
}

export interface PluginMcpToolInvocationResult {
  content: { type: "text"; text: string }[];
  details: {
    pluginId: string;
    pluginName: string;
    serverName: string;
    toolName: string;
    stderr?: string;
    outputOutput?: MaterializedTextOutput;
  };
}

export class PluginMcpSupervisor {
  private readonly runtimeManager = new PluginMcpRuntimeManager();

  async inspectPluginMcpServers(
    plugins: CodexPluginSummary[],
    options: { timeoutMs?: number; permissionMode?: PermissionMode; workspacePath?: string } = {},
  ): Promise<CodexPluginMcpInspectionCatalog> {
    const resolved = resolvePluginMcpOptions(options);
    const servers: CodexPluginMcpServerInspection[] = [];

    for (const plan of buildPluginMcpLaunchPlans(plugins)) {
      if (!plan.startable) {
        servers.push({
          pluginId: plan.pluginId,
          pluginName: plan.pluginName,
          serverName: plan.serverName,
          status: "skipped",
          tools: [],
          reason: plan.reason ?? "MCP server is not startable.",
        });
        continue;
      }

      servers.push(await this.inspectOneServer(plan, resolved));
    }

    return { servers };
  }

  async buildPluginMcpToolRegistrations(
    plugins: CodexPluginSummary[],
    options: { timeoutMs?: number; permissionMode?: PermissionMode; workspacePath?: string } = {},
  ): Promise<PluginMcpToolRegistration[]> {
    const launchPlans = buildPluginMcpLaunchPlans(plugins);
    const launchPlanByServer = new Map(launchPlans.map((plan) => [launchPlanKey(plan), plan]));
    const catalog = await this.inspectPluginMcpServers(plugins, options);
    const usedNames = new Set(["bash", "read", "write", "edit", "grep", "find", "ls"]);
    const registrations: PluginMcpToolRegistration[] = [];

    for (const server of catalog.servers) {
      if (server.status !== "ready") continue;
      const launchPlan = launchPlanByServer.get(inspectionKey(server));
      if (!launchPlan) continue;

      for (const tool of server.tools) {
        const registeredName = uniqueToolName(tool.name, usedNames, [tool.pluginName, tool.serverName, tool.name]);
        usedNames.add(registeredName);
        const label = `${tool.pluginName}: ${tool.name}`;
        const description = pluginToolDescription(tool);
        const promptSnippet = pluginToolPromptSnippet(registeredName, tool);
        const promptGuidelines = [
          `Use ${registeredName} when the enabled Codex plugin "${tool.pluginName}" provides the requested capability.`,
          "Plugin tools run locally through their MCP server; summarize their returned result before continuing.",
        ];
        const parameters = pluginToolParameters(tool.inputSchema);
        registrations.push({
          registeredName,
          originalName: tool.name,
          label,
          description,
          promptSnippet,
          promptGuidelines,
          parameters,
          descriptor: pluginMcpToolDescriptor({
            registeredName,
            label,
            description,
            promptSnippet,
            promptGuidelines,
            parameters,
          }),
          launchPlan,
          tool,
        });
      }
    }

    return registrations;
  }

  async callPluginMcpTool(
    plan: PluginMcpLaunchPlan,
    invocation: PluginMcpToolInvocation,
    options: { timeoutMs?: number; permissionMode?: PermissionMode; workspacePath?: string; signal?: AbortSignal } = {},
  ): Promise<PluginMcpToolInvocationResult> {
    if (!plan.startable) {
      throw new Error(plan.reason ?? "MCP server is not startable.");
    }

    const resolved = resolvePluginMcpOptions(options);
    if (resolved.signal?.aborted) {
      throw new Error("Plugin MCP tool call aborted.");
    }
    const runtime = await this.runtimeManager.ensureRuntime(plan, resolved);
    if (resolved.signal?.aborted) {
      await this.runtimeManager.markRuntimeUnhealthy(runtime, "Plugin MCP tool call aborted.");
      throw new Error("Plugin MCP tool call aborted.");
    }
    let result: unknown;
    runtime.requestCount += 1;
    const finishEvent = startRuntimeEvent(runtime, "tools/call", invocation.toolName);
    try {
      result = await runtime.client.request(
        "tools/call",
        {
          name: invocation.toolName,
          arguments: invocation.arguments ?? {},
        },
        resolved.timeoutMs,
        resolved.signal,
      );
      finishEvent("succeeded");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      finishEvent("failed", message);
      if (resolved.signal?.aborted || isRuntimeTransportError(message)) {
        await this.runtimeManager.markRuntimeUnhealthy(runtime, message);
      }
      throw error;
    }

    const text = textFromToolCallResult(result);
    if (isMcpToolError(result)) {
      throw new Error(text || `Plugin tool ${invocation.toolName} failed.`);
    }
    const output = await materializeTextOutput(runtime.workspacePath, {
      label: `plugin-mcp-${plan.pluginName}-${plan.serverName}-${invocation.toolName}`,
      text,
      maxPreviewChars: pluginMcpResultPreviewChars,
      extension: "txt",
    });
    const contentText = output.truncated ? `${output.text}\n\n${materializedTextNotice("plugin output", output)}` : output.text;
    return {
      content: [{ type: "text", text: contentText }],
      details: {
        pluginId: plan.pluginId,
        pluginName: plan.pluginName,
        serverName: plan.serverName,
        toolName: invocation.toolName,
        ...(runtime.stderrChunks.length > 0 ? { stderr: truncate(redactSensitiveText(runtime.stderrChunks.join("")), 2_000) } : {}),
        ...(output.truncated ? { outputOutput: output } : {}),
      },
    };
  }

  snapshots(): PluginMcpRuntimeSnapshot[] {
    return this.runtimeManager.snapshots();
  }

  async restartRuntime(key: string, options: { timeoutMs?: number } = {}): Promise<PluginMcpRuntimeSnapshot[] | undefined> {
    return this.runtimeManager.restartRuntime(key, options);
  }

  async stopRuntimeByKey(key: string): Promise<PluginMcpRuntimeSnapshot[] | undefined> {
    return this.runtimeManager.stopRuntimeByKey(key);
  }

  async shutdown(): Promise<void> {
    await this.runtimeManager.shutdown();
  }

  async shutdownWorkspace(workspacePath: string): Promise<void> {
    await this.runtimeManager.shutdownWorkspace(workspacePath);
  }

  private async inspectOneServer(plan: PluginMcpLaunchPlan, options: ResolvedPluginMcpOptions): Promise<CodexPluginMcpServerInspection> {
    try {
      const runtime = await this.runtimeManager.ensureRuntime(plan, options);
      const tools = await this.runtimeManager.listTools(runtime, options.timeoutMs);

      return {
        pluginId: plan.pluginId,
        pluginName: plan.pluginName,
        serverName: plan.serverName,
        status: "ready",
        tools,
        ...(runtime.stderrChunks.length > 0 ? { stderr: truncate(runtime.stderrChunks.join(""), 2_000) } : {}),
      };
    } catch (error) {
      return {
        pluginId: plan.pluginId,
        pluginName: plan.pluginName,
        serverName: plan.serverName,
        status: "error",
        tools: [],
        reason: error instanceof Error ? error.message : String(error),
      };
    }
  }
}

export function buildPluginMcpLaunchPlans(plugins: CodexPluginSummary[]): PluginMcpLaunchPlan[] {
  return plugins.flatMap((plugin) =>
    plugin.mcpServers.map((server) => {
      const reason = disabledReason(plugin, server.command);
      return {
        pluginId: plugin.id,
        pluginName: plugin.name,
        pluginVersion: plugin.version,
        pluginFingerprint: codexPluginRuntimeFingerprint(plugin),
        serverName: server.name,
        cwd: plugin.rootPath,
        command: server.command,
        args: server.args,
        envKeys: server.envKeys,
        enabled: plugin.enabled,
        startable: !reason,
        ...(reason ? { reason } : {}),
      };
    }),
  );
}

export async function inspectPluginMcpServers(
  plugins: CodexPluginSummary[],
  options: { timeoutMs?: number; permissionMode?: PermissionMode; workspacePath?: string } = {},
): Promise<CodexPluginMcpInspectionCatalog> {
  const supervisor = new PluginMcpSupervisor();
  try {
    return await supervisor.inspectPluginMcpServers(plugins, options);
  } finally {
    await supervisor.shutdown();
  }
}

export async function buildPluginMcpToolRegistrations(
  plugins: CodexPluginSummary[],
  options: { timeoutMs?: number; permissionMode?: PermissionMode; workspacePath?: string } = {},
): Promise<PluginMcpToolRegistration[]> {
  const supervisor = new PluginMcpSupervisor();
  try {
    return await supervisor.buildPluginMcpToolRegistrations(plugins, options);
  } finally {
    await supervisor.shutdown();
  }
}

export async function callPluginMcpTool(
  plan: PluginMcpLaunchPlan,
  invocation: PluginMcpToolInvocation,
  options: { timeoutMs?: number; permissionMode?: PermissionMode; workspacePath?: string; signal?: AbortSignal } = {},
): Promise<PluginMcpToolInvocationResult> {
  const supervisor = new PluginMcpSupervisor();
  try {
    return await supervisor.callPluginMcpTool(plan, invocation, options);
  } finally {
    await supervisor.shutdown();
  }
}

function disabledReason(plugin: CodexPluginSummary, command: string | undefined): string | undefined {
  if (!plugin.enabled) return "Plugin is disabled.";
  if (plugin.errors.length > 0) return "Plugin has manifest or marketplace errors.";
  if (plugin.dependencyStatus?.required && !plugin.dependencyStatus.installed) {
    return plugin.dependencyStatus.reason ?? "Plugin MCP server dependencies are not installed.";
  }
  if (!command) return "MCP server command is missing.";
  if (command.includes("\0")) return "MCP server command contains invalid characters.";
  return undefined;
}

function pluginToolDescription(tool: CodexPluginMcpTool): string {
  const base = tool.description || `Run the ${tool.name} MCP tool.`;
  return `${base}\n\nSource: Codex plugin "${tool.pluginName}", MCP server "${tool.serverName}".`;
}

function pluginToolPromptSnippet(registeredName: string, tool: CodexPluginMcpTool): string {
  const description = (tool.description || `Run ${tool.name}.`).replace(/\s+/g, " ").trim();
  return `${registeredName}: ${description} (Codex plugin "${tool.pluginName}")`;
}

function pluginToolParameters(schema: unknown): unknown {
  if (schema && typeof schema === "object" && !Array.isArray(schema)) return schema;
  return {
    type: "object",
    properties: {},
    additionalProperties: true,
  };
}

function uniqueToolName(preferredName: string, usedNames: Set<string>, fallbackParts: string[]): string {
  const preferred = normalizeToolName(preferredName);
  if (preferred && !usedNames.has(preferred)) return preferred;
  const fallback = normalizeToolName(fallbackParts.join("_")) || "plugin_tool";
  if (!usedNames.has(fallback)) return fallback;

  for (let index = 2; index < 100; index += 1) {
    const candidate = toolNameWithSuffix(fallback, `_${index}`);
    if (!usedNames.has(candidate)) return candidate;
  }

  return toolNameWithSuffix(fallback, `_${Date.now()}`);
}

function normalizeToolName(value: string): string | undefined {
  const normalized = value
    .trim()
    .replace(/[^a-zA-Z0-9_]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "")
    .toLowerCase();
  if (!normalized) return undefined;
  const prefixed = /^[a-zA-Z]/.test(normalized) ? normalized : `plugin_${normalized}`;
  return trimToolName(prefixed);
}

function trimToolName(value: string): string {
  return value.length > 64 ? value.slice(0, 64).replace(/_+$/g, "") : value;
}

function toolNameWithSuffix(base: string, suffix: string): string {
  const stem = base.slice(0, Math.max(1, 64 - suffix.length)).replace(/_+$/g, "");
  return `${stem}${suffix}`;
}

function launchPlanKey(plan: PluginMcpLaunchPlan): string {
  return `${plan.pluginId}\0${plan.serverName}`;
}

function inspectionKey(inspection: CodexPluginMcpServerInspection): string {
  return `${inspection.pluginId}\0${inspection.serverName}`;
}

export function codexPluginRuntimeFingerprint(plugin: CodexPluginSummary): string {
  return JSON.stringify({
    version: plugin.version,
    sourceKind: plugin.sourceKind,
    sourcePath: plugin.sourcePath ?? null,
    sourceRef: plugin.sourceRef ?? null,
    sourceSha: plugin.sourceSha ?? null,
    sourceChecksum: plugin.sourceChecksum ?? null,
    sourceUrl: plugin.sourceUrl ?? null,
    dependencyInstalled: plugin.dependencyStatus?.installed ?? null,
    dependencyPackageJsonPath: plugin.dependencyStatus?.packageJsonPath ?? null,
  });
}

function isMcpToolError(result: unknown): boolean {
  return Boolean(result && typeof result === "object" && (result as { isError?: unknown }).isError);
}

function isRuntimeTransportError(message: string): boolean {
  return message.startsWith("Timed out waiting for MCP ") || message.startsWith("MCP server exited before responding");
}

function textFromToolCallResult(result: unknown): string {
  if (!result || typeof result !== "object") return result === undefined ? "" : String(result);
  const record = result as Record<string, unknown>;
  const contentText = textFromMcpContent(record.content);
  const structuredText =
    "structuredContent" in record && record.structuredContent !== undefined
      ? `\n\nStructured content:\n${JSON.stringify(record.structuredContent, null, 2)}`
      : "";
  return `${contentText}${structuredText}`.trim() || "Plugin tool completed without text.";
}

function textFromMcpContent(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return content === undefined ? "" : JSON.stringify(content, null, 2);
  return content
    .map((item) => {
      if (!item || typeof item !== "object") return String(item);
      const record = item as Record<string, unknown>;
      if (record.type === "text") return typeof record.text === "string" ? record.text : "";
      if (record.type === "image") return `[image: ${typeof record.mimeType === "string" ? record.mimeType : "image"}]`;
      if (typeof record.uri === "string") return `[resource: ${record.uri}]`;
      return JSON.stringify(record);
    })
    .filter(Boolean)
    .join("\n");
}
