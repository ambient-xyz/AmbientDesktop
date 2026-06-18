import type { SearchRoutingSettings } from "../../shared/webResearchTypes";
import type { AmbientCliPackageCatalog } from "./webResearchAmbientCliFacade";
import { webResearchSettingsWithDynamicProviderCatalogs } from "./searchSettingsTools";
import type { McpToolDescriptor } from "./webResearchMcpFacade";

export interface HydrateWebResearchSettingsInput {
  settings?: SearchRoutingSettings;
  discoverAmbientCliCatalog?: () => Promise<AmbientCliPackageCatalog>;
  discoverMcpTools?: () => Promise<McpToolDescriptor[]>;
}

export async function hydrateWebResearchSettings(input: HydrateWebResearchSettingsInput): Promise<SearchRoutingSettings> {
  const [ambientCliCatalog, mcpTools] = await Promise.all([
    input.discoverAmbientCliCatalog?.().catch(() => ({ packages: [], errors: [] })),
    input.discoverMcpTools?.().catch(() => []),
  ]);
  return webResearchSettingsWithDynamicProviderCatalogs(input.settings, {
    ambientCliCatalog,
    mcpTools,
  });
}
