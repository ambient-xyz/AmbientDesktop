import type { AgentToolResult, ExtensionAPI, ExtensionFactory } from "@mariozechner/pi-coding-agent";

import type { PermissionGrantScopeKind, PermissionRisk } from "../../shared/permissionTypes";
import type { SearchRoutingSettings } from "../../shared/webResearchTypes";
import type { WorkspaceState } from "../../shared/workspaceTypes";
import type { ThreadSummary } from "../../shared/threadTypes";
import type { AmbientCliPackageCatalog } from "../ambient-cli/ambientCliPackages";
import {
  searchPreferenceToolDescriptor,
  webResearchToolDescriptor,
} from "./agentRuntimeDesktopToolFacade";
import { registerDesktopTool } from "./agentRuntimeDesktopToolFacade";
import {
  buildSearchPreferenceStatus,
  planWebResearchPreferenceUpdate,
  searchPreferenceStatusText,
  webResearchPreferenceApprovalDetail,
  webResearchPreferenceUpdateText,
  type SearchPreferenceUpdateInput,
} from "../web-research/searchSettingsTools";

type SearchPreferenceToolUpdate = AgentToolResult<Record<string, unknown>>;
type SearchPreferenceToolUpdateHandler = (update: SearchPreferenceToolUpdate) => void;

export interface SearchPreferenceToolPermissionRequest {
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

export interface SearchPreferenceToolRegistrationOptions {
  threadId: string;
  workspace: WorkspaceState;
  getThread: (threadId: string) => ThreadSummary;
  readSettings: () => SearchRoutingSettings | undefined;
  updateSettings?: (input: SearchRoutingSettings) => Promise<SearchRoutingSettings> | SearchRoutingSettings;
  discoverAmbientCliPackages: (
    workspacePath: string,
    options: { includeHealth: true },
  ) => Promise<AmbientCliPackageCatalog>;
  resolveFirstPartyPluginPermission: (input: SearchPreferenceToolPermissionRequest) => Promise<boolean>;
  now?: () => Date;
}

export function createSearchPreferenceToolExtension(options: SearchPreferenceToolRegistrationOptions): ExtensionFactory {
  return (pi) => {
    registerSearchPreferenceTools(pi, options);
  };
}

export function registerSearchPreferenceTools(
  pi: Pick<ExtensionAPI, "registerTool">,
  options: SearchPreferenceToolRegistrationOptions,
): void {
  const {
    threadId,
    workspace,
    getThread,
    readSettings,
    updateSettings,
    discoverAmbientCliPackages,
    resolveFirstPartyPluginPermission,
    now,
  } = options;

  registerDesktopTool(pi, searchPreferenceToolDescriptor("ambient_search_preference_status"), {
    executionMode: "sequential",
    execute: async () => {
      const settings = readSettings() ?? {};
      const catalog = await discoverAmbientCliPackages(workspace.path, { includeHealth: true }).catch(() => ({ packages: [], errors: [] }));
      const result = buildSearchPreferenceStatus(settings, catalog);
      return searchPreferenceToolResult(searchPreferenceStatusText(result), {
        toolName: "ambient_search_preference_status",
        status: "complete",
        settings: result.settings,
        providerCount: result.providerCount,
        availableProviderCount: result.availableProviderCount,
        selectedProvider: result.selectedProvider,
        providers: result.providers,
      });
    },
  });

  registerDesktopTool(pi, webResearchToolDescriptor("web_research_preferences_update"), {
    executionMode: "sequential",
    execute: async (_toolCallId, params, _signal, onUpdate?: SearchPreferenceToolUpdateHandler) => {
      const toolName = "web_research_preferences_update";
      const thread = getThread(threadId);
      if (thread.collaborationMode === "planner") throw new Error("Search preference changes are blocked in Planner Mode.");
      const current = readSettings() ?? {};
      if (!updateSettings) throw new Error("Ambient web research preference updates are not available in this runtime.");
      const catalog = await discoverAmbientCliPackages(workspace.path, { includeHealth: true }).catch(() => ({ packages: [], errors: [] }));
      const plan = planWebResearchPreferenceUpdate(params as SearchPreferenceUpdateInput, current, catalog, now?.());
      if (!plan.hasChanges) {
        return searchPreferenceToolResult(webResearchPreferenceUpdateText(plan, current), {
          toolName,
          status: "no-op",
          role: plan.role,
          previousSettings: plan.previousSettings,
          settings: plan.nextSettings,
          selectedProvider: plan.nextProvider,
          providerOrder: plan.nextOrder,
        });
      }
      const detail = webResearchPreferenceApprovalDetail(plan, workspace.path);
      const title = plan.action === "reset_search_defaults"
        ? "Reset Ambient web research preference?"
        : plan.nextProvider
          ? `${plan.action === "require_provider" ? "Require" : "Prefer"} ${plan.nextProvider.label} for ${plan.role}?`
          : `Update Ambient web research ${plan.role} provider order?`;
      const allowed = await resolveFirstPartyPluginPermission({
        thread,
        workspace,
        toolName,
        title,
        message: "Ambient wants to update the global Search & Web preference for future public research routing.",
        detail,
        grantTargetLabel: "Update Search & Web routing preference",
        grantTargetIdentity: [
          toolName,
          stableJson(plan.previousSettings),
          stableJson(plan.nextSettings),
        ].join("\0"),
        allowedReason: "Ambient web research preference change approved by Ambient permission grant policy.",
        deniedReason: "Ambient web research preference prompt denied or timed out.",
      });
      if (!allowed) throw new Error("Ambient web research preference update blocked by approval prompt.");
      onUpdate?.(searchPreferenceToolResult("Updating Ambient web research provider preference.", {
        toolName,
        status: "running",
        role: plan.role,
        providerOrder: plan.nextOrder,
      }));
      const savedSettings = await updateSettings(plan.nextSettings);
      return searchPreferenceToolResult(webResearchPreferenceUpdateText(plan, savedSettings), {
        toolName,
        status: "complete",
        role: plan.role,
        previousSettings: plan.previousSettings,
        settings: savedSettings,
        selectedProvider: plan.nextProvider,
        providerOrder: plan.nextOrder,
      });
    },
  });
}

function searchPreferenceToolResult(
  text: string,
  details: Record<string, unknown>,
): { content: { type: "text"; text: string }[]; details: Record<string, unknown> } {
  return {
    content: [{ type: "text", text }],
    details: {
      runtime: "ambient-search-routing",
      ...details,
    },
  };
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
