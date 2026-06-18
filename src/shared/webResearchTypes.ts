export type SearchRoutingActivity = "web_search";

export type SearchRoutingMode = "prefer" | "require";

export type SearchRoutingFallback = "allow" | "block";

export type WebResearchProviderRole = "search" | "fetch" | "interactive_browser";

export type WebResearchCapabilityKind =
  | "search"
  | "static_fetch_extract"
  | "dynamic_headless_browser"
  | "interactive_browser";

export type WebResearchCapabilityProbeStatus = "untested" | "passed" | "failed" | "degraded";

export type WebResearchProviderKind = "remote-mcp" | "toolhive-mcp" | "built-in-browser" | "ambient-cli";

export type WebResearchProviderConfigStatus = "enabled" | "disabled";

export interface SearchProviderPreference {
  activity: SearchRoutingActivity;
  preferredProvider: string;
  mode: SearchRoutingMode;
  fallback: SearchRoutingFallback;
  updatedAt?: string;
}

export interface WebResearchAmbientCliBinding {
  packageId?: string;
  packageName: string;
  commandName: string;
  capabilityId?: string;
}

export interface WebResearchMcpBinding {
  serverId?: string;
  workloadName?: string;
  toolName: string;
  argumentName?: string;
}

export interface WebResearchProviderConfig {
  providerId: string;
  label: string;
  kind: WebResearchProviderKind;
  roles: WebResearchProviderRole[];
  status: WebResearchProviderConfigStatus;
  capabilityKinds?: WebResearchCapabilityKind[];
  capabilityProbeStatus?: WebResearchCapabilityProbeStatus;
  capabilityProbeEvidenceRefs?: string[];
  capabilityFailureNotes?: string[];
  privacyLabel?: string;
  optionalSecretRefs?: string[];
  ambientCli?: WebResearchAmbientCliBinding;
  mcp?: WebResearchMcpBinding;
}

export interface WebResearchFallbackPolicy {
  allowBrowserFallback: boolean;
}

export interface WebResearchProviderStackSettings {
  schemaVersion: "ambient-web-research-provider-stack-v1";
  providers: WebResearchProviderConfig[];
  preferences: Partial<Record<WebResearchProviderRole, string[]>>;
  fallbackPolicy: WebResearchFallbackPolicy;
  updatedAt?: string;
}

export interface SearchRoutingSettings {
  webSearch?: SearchProviderPreference;
  webResearch?: WebResearchProviderStackSettings;
}
