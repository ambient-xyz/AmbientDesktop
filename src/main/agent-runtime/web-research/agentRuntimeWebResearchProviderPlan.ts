import type {
  SearchRoutingSettings,
  WebResearchProviderRole,
  WorkspaceState,
} from "../../../shared/types";
import type { AmbientCliPackageCatalog } from "../../ambient-cli/ambientCliPackages";
import type { LocalDeepResearchProviderSnapshot } from "../../local-deep-research/localDeepResearchSetup";
import type { McpToolDescriptor } from "../../mcp/mcpToolBridge";
import { webResearchSettingsWithDynamicProviderCatalogs } from "../../web-research/searchSettingsTools";
import {
  normalizeSearchRoutingSettingsWithWebResearch,
  planWebResearchProviderOrder,
  type WebResearchProviderRequestPlan,
} from "../../web-research/webResearchProviderStack";

export interface WebResearchProviderPlanRequest {
  workspace: WorkspaceState;
  input: Record<string, unknown>;
  role: WebResearchProviderRole;
  signal?: AbortSignal;
  providerSnapshot?: LocalDeepResearchProviderSnapshot;
  allowBrowserFallback?: boolean;
}

export interface WebResearchProviderPlanOptions {
  readSettings: () => SearchRoutingSettings | undefined;
  discoverAmbientCliPackages: (
    workspacePath: string,
    options?: { includeHealth?: boolean },
  ) => Promise<AmbientCliPackageCatalog>;
  discoverMcpProviderTools: (signal?: AbortSignal) => Promise<McpToolDescriptor[]>;
}

export async function webResearchProviderPlanForInput(
  request: WebResearchProviderPlanRequest,
  options: WebResearchProviderPlanOptions,
): Promise<WebResearchProviderRequestPlan> {
  const baseSettings = options.readSettings() ?? {};
  const catalog = await options.discoverAmbientCliPackages(request.workspace.path, { includeHealth: true }).catch(() => ({ packages: [], errors: [] }));
  const mcpTools = await options.discoverMcpProviderTools(request.signal);
  const settings = webResearchSettingsWithDynamicProviderCatalogs(baseSettings, { ambientCliCatalog: catalog, mcpTools });
  const plannedSettings = webResearchSettingsWithBrowserFallbackOverride(
    request.providerSnapshot ? searchSettingsWithLocalDeepResearchProviderSnapshot(settings, request.providerSnapshot) : settings,
    request.allowBrowserFallback,
  );
  return planWebResearchProviderOrder({
    settings: plannedSettings,
    role: request.role,
    providerOrder: request.providerSnapshot ? localDeepResearchProviderOrderForRole(request.providerSnapshot, request.role) : request.input.providerOrder,
  });
}

export function searchSettingsWithLocalDeepResearchProviderSnapshot(
  settings: SearchRoutingSettings,
  snapshot: LocalDeepResearchProviderSnapshot,
): SearchRoutingSettings {
  const stack = normalizeSearchRoutingSettingsWithWebResearch(settings).webResearch;
  const snapshotProviderIds = new Set(snapshot.providers.map((provider) => provider.providerId));
  const providers = snapshot.providers.length
    ? [
        ...snapshot.providers,
        ...stack.providers.filter((provider) => !snapshotProviderIds.has(provider.providerId)),
      ]
    : stack.providers;
  return {
    webResearch: {
      ...stack,
      providers,
      preferences: {
        ...stack.preferences,
        search: [...snapshot.searchOrder],
        fetch: [...snapshot.fetchOrder],
      },
      fallbackPolicy: { ...snapshot.fallbackPolicy },
      updatedAt: snapshot.capturedAt,
    },
  };
}

function webResearchSettingsWithBrowserFallbackOverride(
  settings: SearchRoutingSettings,
  allowBrowserFallback: boolean | undefined,
): SearchRoutingSettings {
  if (allowBrowserFallback !== false) return settings;
  const stack = normalizeSearchRoutingSettingsWithWebResearch(settings).webResearch;
  return {
    webResearch: {
      ...stack,
      fallbackPolicy: {
        ...stack.fallbackPolicy,
        allowBrowserFallback: false,
      },
    },
  };
}

export function localDeepResearchProviderOrderForRole(
  snapshot: LocalDeepResearchProviderSnapshot,
  role: WebResearchProviderRole,
): string[] | undefined {
  if (role === "search") return snapshot.searchOrder;
  if (role === "fetch") return snapshot.fetchOrder;
  return undefined;
}
