import type { AgentToolResult, ExtensionAPI } from "@mariozechner/pi-coding-agent";

import type {
  LocalDeepResearchSettings,
} from "../../shared/localRuntimeTypes";
import type { PermissionGrantScopeKind, PermissionRisk } from "../../shared/permissionTypes";
import type { ThreadSummary } from "../../shared/threadTypes";
import type { WorkspaceState } from "../../shared/workspaceTypes";
import { localDeepResearchToolDescriptor } from "../desktop-tools/desktopToolRegistry";
import { registerDesktopTool } from "../desktop-tools/desktopToolRegistration";
import {
  buildLocalDeepResearchProviderDiscovery,
  buildLocalDeepResearchProviderStackStatus,
  describeLocalDeepResearchProvider,
  localDeepResearchProviderDescribeText,
  localDeepResearchProviderDiscoveryText,
  localDeepResearchProviderPreferenceApprovalDetail,
  localDeepResearchProviderPreferenceUpdateText,
  localDeepResearchProviderStackStatusText,
  planLocalDeepResearchProviderPreferenceUpdate,
  type LocalDeepResearchProviderPreferenceUpdateInput,
} from "./localDeepResearchProviderStack";

type LocalDeepResearchToolUpdate = AgentToolResult<Record<string, unknown>>;
type LocalDeepResearchToolUpdateHandler = (update: LocalDeepResearchToolUpdate) => void;

export interface LocalDeepResearchProviderToolPermissionRequest {
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

export interface LocalDeepResearchProviderToolRegistrationOptions {
  threadId?: string;
  workspace?: WorkspaceState;
  getThread?: (threadId: string) => ThreadSummary;
  readSettings?: () => LocalDeepResearchSettings | undefined;
  updateSettings?: (input: LocalDeepResearchSettings) => Promise<LocalDeepResearchSettings> | LocalDeepResearchSettings;
  resolveFirstPartyPluginPermission?: (input: LocalDeepResearchProviderToolPermissionRequest) => Promise<boolean>;
}

export function registerLocalDeepResearchProviderTools(
  pi: Pick<ExtensionAPI, "registerTool">,
  options: LocalDeepResearchProviderToolRegistrationOptions = {},
): void {
  const readSettings = () => options.readSettings?.();

  registerDesktopTool(pi, localDeepResearchToolDescriptor("ambient_local_deep_research_provider_status"), {
    executionMode: "sequential",
    execute: async () => {
      const result = buildLocalDeepResearchProviderStackStatus({
        settings: readSettings(),
      });
      return localDeepResearchToolResult(localDeepResearchProviderStackStatusText(result), {
        toolName: "ambient_local_deep_research_provider_status",
        status: "complete",
        settings: result.settings,
        activeProvider: result.activeProvider,
        providerOrder: result.providerOrder,
        skippedProviders: result.skippedProviders,
        roles: result.roles,
      });
    },
  });

  registerDesktopTool(pi, localDeepResearchToolDescriptor("ambient_local_deep_research_provider_search"), {
    executionMode: "sequential",
    execute: async (_toolCallId, params) => {
      const input = params as Record<string, unknown>;
      const result = buildLocalDeepResearchProviderDiscovery({
        settings: readSettings(),
        query: optionalString(input.query),
        limit: optionalNumber(input.limit),
      });
      return localDeepResearchToolResult(localDeepResearchProviderDiscoveryText(result), {
        toolName: "ambient_local_deep_research_provider_search",
        status: "complete",
        ...result,
      });
    },
  });

  registerDesktopTool(pi, localDeepResearchToolDescriptor("ambient_local_deep_research_provider_describe"), {
    executionMode: "sequential",
    execute: async (_toolCallId, params) => {
      const input = params as Record<string, unknown>;
      const provider = requiredString(input, "provider");
      const result = describeLocalDeepResearchProvider({
        settings: readSettings(),
        provider,
        limit: optionalNumber(input.limit),
      });
      return localDeepResearchToolResult(localDeepResearchProviderDescribeText(result, provider), {
        toolName: "ambient_local_deep_research_provider_describe",
        status: "complete",
        provider,
        ...result,
      });
    },
  });

  registerDesktopTool(pi, localDeepResearchToolDescriptor("ambient_local_deep_research_provider_update"), {
    executionMode: "sequential",
    execute: async (_toolCallId, params, _signal, onUpdate?: LocalDeepResearchToolUpdateHandler) => {
      if (!options.threadId || !options.getThread) throw new Error("Ambient Local Deep Research provider updates are not available in this runtime.");
      const thread = options.getThread(options.threadId);
      if (thread.collaborationMode === "planner") throw new Error("Local Deep Research provider changes are blocked in Planner Mode.");
      if (!options.updateSettings) throw new Error("Ambient Local Deep Research provider updates are not available in this runtime.");
      const current = readSettings();
      const plan = planLocalDeepResearchProviderPreferenceUpdate(params as LocalDeepResearchProviderPreferenceUpdateInput, current);
      if (!plan.hasChanges) {
        return localDeepResearchToolResult(localDeepResearchProviderPreferenceUpdateText(plan, plan.nextSettings), {
          toolName: "ambient_local_deep_research_provider_update",
          status: "no-op",
          previousSettings: plan.previousSettings,
          settings: plan.nextSettings,
          selectedProvider: plan.nextProvider,
        });
      }
      if (!options.workspace || !options.resolveFirstPartyPluginPermission) throw new Error("Ambient Local Deep Research provider updates are not available in this runtime.");
      const title = plan.action === "set_final_synthesis" && plan.nextProvider
        ? `Update ${plan.nextProvider.label} final synthesis mode?`
        : plan.nextProvider
          ? `Make ${plan.nextProvider.label} the active Local Deep Research provider?`
          : "Update Local Deep Research provider order?";
      const message = plan.action === "set_final_synthesis"
        ? "Ambient wants to update the global Local Deep Research provider final synthesis configuration for future research runs."
        : "Ambient wants to update the global Local Deep Research provider preference for future research runs.";
      const allowed = await options.resolveFirstPartyPluginPermission({
        thread,
        workspace: options.workspace,
        toolName: "ambient_local_deep_research_provider_update",
        title,
        message,
        detail: localDeepResearchProviderPreferenceApprovalDetail(plan, options.workspace.path),
        grantTargetLabel: plan.action === "set_final_synthesis"
          ? "Update Local Deep Research final synthesis configuration"
          : "Update Local Deep Research provider preference",
        grantTargetIdentity: [
          "ambient_local_deep_research_provider_update",
          stableJson(plan.previousSettings),
          stableJson(plan.nextSettings),
        ].join("\0"),
        allowedReason: "Ambient Local Deep Research provider preference change approved by Ambient permission grant policy.",
        deniedReason: "Ambient Local Deep Research provider preference prompt denied or timed out.",
      });
      if (!allowed) throw new Error("Ambient Local Deep Research provider update blocked by approval prompt.");
      onUpdate?.(localDeepResearchToolUpdate(
        "ambient_local_deep_research_provider_update",
        plan.action === "set_final_synthesis"
          ? "Updating Ambient Local Deep Research final synthesis configuration."
          : "Updating Ambient Local Deep Research provider preference.",
      ));
      const savedSettings = await options.updateSettings(plan.nextSettings);
      return localDeepResearchToolResult(localDeepResearchProviderPreferenceUpdateText(plan, savedSettings), {
        toolName: "ambient_local_deep_research_provider_update",
        status: "complete",
        previousSettings: plan.previousSettings,
        settings: savedSettings,
        selectedProvider: plan.nextProvider,
      });
    },
  });
}

function localDeepResearchToolResult(
  text: string,
  details: Record<string, unknown>,
): AgentToolResult<Record<string, unknown>> {
  return {
    content: [{ type: "text", text }],
    details: {
      runtime: "ambient-local-deep-research",
      ...details,
    },
  };
}

function localDeepResearchToolUpdate(toolName: string, text: string): LocalDeepResearchToolUpdate {
  return localDeepResearchToolResult(text, {
    toolName,
    status: "running",
  });
}

function requiredString(input: Record<string, unknown>, key: string): string {
  const value = input[key];
  if (typeof value !== "string" || !value.trim()) throw new Error(`${key} is required.`);
  return value;
}

function optionalNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

function stableJson(value: unknown): string {
  if (!value || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((item) => stableJson(item)).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`)
    .join(",")}}`;
}
