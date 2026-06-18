import type {
  WebResearchCapabilityKind,
  WebResearchProviderConfig,
  WebResearchProviderRole,
} from "../../../shared/webResearchTypes";
import type { SubagentToolScopeSnapshotSummary } from "../../../shared/subagentTypes";
import type {
  ChildLaunchPolicySnapshot,
  SymphonyWebCapabilityKind,
  WebCapabilityProfile,
} from "../../../shared/symphonyFineGrainedContracts";
import {
  SYMPHONY_WEB_CAPABILITY_PROFILE_SCHEMA_VERSION,
  assertAmbientSubagentsEnabledForSymphony,
} from "../../../shared/symphonyFineGrainedContracts";
import type { AmbientFeatureFlagSnapshot } from "../../../shared/featureFlags";

export const SYMPHONY_WEB_CAPABILITY_ROUTE_PLAN_SCHEMA_VERSION =
  "ambient-symphony-web-capability-route-plan-v1" as const;

export interface SymphonyWebCapabilityRoutePlan {
  schemaVersion: typeof SYMPHONY_WEB_CAPABILITY_ROUTE_PLAN_SCHEMA_VERSION;
  webProviderOrder: ChildLaunchPolicySnapshot["webProviderOrder"];
  profiles: WebCapabilityProfile[];
}

export interface SymphonyWebResearchProviderStack {
  providers: WebResearchProviderConfig[];
  preferences: Partial<Record<WebResearchProviderRole, string[]>>;
}

export interface SymphonyWebResearchProviderRequestPlan {
  providers: WebResearchProviderConfig[];
  providerOrder: string[];
  skippedProviders: Array<{
    providerId: string;
    reason: string;
  }>;
}

export interface SymphonyWebCapabilityRoutePlanInput {
  webResearch: SymphonyWebResearchProviderStack;
  featureFlagSnapshot: AmbientFeatureFlagSnapshot;
  childToolScopeSnapshot?: Pick<SubagentToolScopeSnapshotSummary, "scope" | "resolverInputs">;
  childLaunchPolicySnapshot?: Pick<ChildLaunchPolicySnapshot, "webProviderOrder">;
  interactiveBrowserApproved?: boolean;
}

export interface SymphonyWebResearchProviderPlanInput extends SymphonyWebCapabilityRoutePlanInput {
  role: Extract<WebResearchProviderRole, "search" | "fetch">;
  providerOrder?: unknown;
  legacyPlan: SymphonyWebResearchProviderRequestPlan;
}

export function buildSymphonyWebCapabilityRoutePlan(
  input: SymphonyWebCapabilityRoutePlanInput,
): SymphonyWebCapabilityRoutePlan {
  assertAmbientSubagentsEnabledForSymphony(input.featureFlagSnapshot);
  const stack = input.webResearch;
  const interactiveBrowserApproved = input.interactiveBrowserApproved ??
    childToolScopeAllowsInteractiveBrowserFallback(input.childToolScopeSnapshot);
  const profiles = stack.providers
    .map((provider) => webCapabilityProfileForProvider(provider, stack.preferences))
    .filter((profile) => profile.supportedKinds.length > 0);
  const computedWebProviderOrder: ChildLaunchPolicySnapshot["webProviderOrder"] = {
    search: capabilityOrder({
      providers: stack.providers,
      preferenceOrder: stack.preferences.search ?? [],
      kind: "search",
    }),
    staticFetchExtract: capabilityOrder({
      providers: stack.providers,
      preferenceOrder: stack.preferences.fetch ?? [],
      kind: "static_fetch_extract",
    }),
    dynamicHeadlessBrowser: capabilityOrder({
      providers: stack.providers,
      preferenceOrder: stack.preferences.fetch ?? [],
      kind: "dynamic_headless_browser",
    }),
    interactiveBrowser: {
      providers: interactiveBrowserApproved
        ? capabilityOrder({
            providers: stack.providers,
            preferenceOrder: stack.preferences.interactive_browser ?? [],
            kind: "interactive_browser",
          })
        : [],
      fallback: interactiveBrowserApproved ? "approval_required" : "deny",
    },
  };
  return {
    schemaVersion: SYMPHONY_WEB_CAPABILITY_ROUTE_PLAN_SCHEMA_VERSION,
    profiles,
    webProviderOrder: constrainWebProviderOrderByLaunchPolicy(
      computedWebProviderOrder,
      input.childLaunchPolicySnapshot?.webProviderOrder,
      stack.providers,
    ),
  };
}

export function planSymphonyWebResearchProviderOrder(
  input: SymphonyWebResearchProviderPlanInput,
): SymphonyWebResearchProviderRequestPlan {
  const routePlan = buildSymphonyWebCapabilityRoutePlan(input);
  const legacyPlan = input.legacyPlan;
  const legacyOrder = legacyPlan.providerOrder;
  const providerById = new Map(legacyPlan.providers.map((provider) => [provider.providerId, provider]));
  const skippedProviderIds = new Set(legacyPlan.skippedProviders.map((provider) => provider.providerId));
  const interactiveBrowserApproved = input.interactiveBrowserApproved === true &&
    routePlan.webProviderOrder.interactiveBrowser.fallback === "approval_required";
  const executableInteractiveBrowserProviders = interactiveBrowserApproved
    ? routePlan.webProviderOrder.interactiveBrowser.providers
    : [];
  const desiredOrder = input.role === "search"
    ? [
        ...routePlan.webProviderOrder.search,
        ...executableInteractiveBrowserProviders,
      ]
    : [
        ...routePlan.webProviderOrder.staticFetchExtract,
        ...routePlan.webProviderOrder.dynamicHeadlessBrowser,
        ...executableInteractiveBrowserProviders,
      ];
  const providerOrderOverride = providerOrderOverrideRequested(input.providerOrder);
  const providerOrder = providerOrderOverride
    ? symphonyOverrideOrder({
        legacyOrder,
        providerById,
        role: input.role,
        policy: input.childLaunchPolicySnapshot?.webProviderOrder,
        interactiveBrowserApproved,
      })
    : symphonyProviderOrder({
        desiredOrder,
        legacyOrder,
        skippedProviderIds,
        providerById,
        role: input.role,
        policy: input.childLaunchPolicySnapshot?.webProviderOrder,
        interactiveBrowserApproved,
      });
  const providerOrderSet = new Set(providerOrder);
  const skippedProviders = [...legacyPlan.skippedProviders];
  const skippedIds = new Set(skippedProviders.map((provider) => provider.providerId));
  for (const providerId of legacyOrder) {
    if (providerOrderSet.has(providerId)) continue;
    if (skippedIds.has(providerId)) continue;
    const provider = legacyPlan.providers.find((candidate) => candidate.providerId === providerId);
    const reason = providerSupportsKind(provider, "interactive_browser") && !interactiveBrowserApproved
      ? "Interactive browser fallback requires child-scoped browser approval."
      : `Provider is not eligible for Symphony ${input.role === "search" ? "search" : "fetch"} capability routing.`;
    skippedProviders.push({ providerId, reason });
    skippedIds.add(providerId);
  }
  return {
    providers: legacyPlan.providers,
    providerOrder,
    skippedProviders,
  };
}

export function childToolScopeAllowsInteractiveBrowserFallback(
  snapshot: Pick<SubagentToolScopeSnapshotSummary, "scope" | "resolverInputs"> | undefined,
): boolean {
  if (!snapshot) return false;
  const visible = new Set(snapshot.scope.piVisibleCategories);
  return visible.has("browser.interactive");
}

function constrainWebProviderOrderByLaunchPolicy(
  order: ChildLaunchPolicySnapshot["webProviderOrder"],
  policy: ChildLaunchPolicySnapshot["webProviderOrder"] | undefined,
  providers: readonly WebResearchProviderConfig[],
): ChildLaunchPolicySnapshot["webProviderOrder"] {
  if (!policy) return order;
  const providerById = new Map(providers.map((provider) => [provider.providerId, provider]));
  const interactiveBrowserApproved = order.interactiveBrowser.fallback === "approval_required";
  return {
    search: policyOrderFilteredByProviderEligibility(policy.search, providerById, "search"),
    staticFetchExtract: policyOrderFilteredByProviderEligibility(
      policy.staticFetchExtract,
      providerById,
      "static_fetch_extract",
    ),
    dynamicHeadlessBrowser: policyOrderFilteredByProviderEligibility(
      policy.dynamicHeadlessBrowser,
      providerById,
      "dynamic_headless_browser",
    ),
    interactiveBrowser: {
      providers: interactiveBrowserApproved
        ? policyOrderFilteredByProviderEligibility(
            policy.interactiveBrowser.providers,
            providerById,
            "interactive_browser",
          )
        : [],
      fallback: policy.interactiveBrowser.fallback === "deny" ? "deny" : order.interactiveBrowser.fallback,
    },
  };
}

export function webCapabilityProfileForProvider(
  provider: WebResearchProviderConfig,
  preferences: Partial<Record<WebResearchProviderRole, string[]>>,
): WebCapabilityProfile {
  const supportedKinds = providerSupportedCapabilityKinds(provider);
  const userPreferenceRank: Partial<Record<SymphonyWebCapabilityKind, number>> = {};
  for (const kind of supportedKinds) {
    const rank = capabilityPreferenceRank(provider.providerId, kind, preferences);
    if (rank !== undefined) userPreferenceRank[kind] = rank;
  }
  return {
    schemaVersion: SYMPHONY_WEB_CAPABILITY_PROFILE_SCHEMA_VERSION,
    providerId: provider.providerId,
    supportedKinds,
    probeStatus: provider.capabilityProbeStatus ?? "untested",
    probeEvidenceRefs: [...(provider.capabilityProbeEvidenceRefs ?? [])],
    userPreferenceRank,
    ...(provider.capabilityFailureNotes?.length ? { failureNotes: [...provider.capabilityFailureNotes] } : {}),
  };
}

export function providerSupportedCapabilityKinds(provider: WebResearchProviderConfig): SymphonyWebCapabilityKind[] {
  const explicit = provider.capabilityKinds?.filter(isSymphonyWebCapabilityKind) ?? [];
  if (explicit.length) return dedupe(explicit);
  const inferred: SymphonyWebCapabilityKind[] = [];
  if (provider.roles.includes("search")) inferred.push("search");
  if (provider.roles.includes("fetch") && provider.kind !== "built-in-browser") inferred.push("static_fetch_extract");
  if (provider.roles.includes("interactive_browser") || provider.kind === "built-in-browser") inferred.push("interactive_browser");
  return dedupe(inferred);
}

function capabilityOrder(input: {
  providers: WebResearchProviderConfig[];
  preferenceOrder: readonly string[];
  kind: SymphonyWebCapabilityKind;
}): string[] {
  const providerById = new Map(input.providers.map((provider) => [provider.providerId, provider]));
  return input.preferenceOrder
    .map((providerId) => providerById.get(providerId))
    .filter((provider): provider is WebResearchProviderConfig => {
      if (!provider) return false;
      return provider.status === "enabled" && providerCapabilityEligible(provider, input.kind);
    })
    .map((provider) => provider.providerId)
    .filter((providerId, index, list) => list.indexOf(providerId) === index);
}

function providerSupportsKind(provider: WebResearchProviderConfig | undefined, kind: SymphonyWebCapabilityKind): boolean {
  return Boolean(provider && providerSupportedCapabilityKinds(provider).includes(kind));
}

function providerCapabilityEligible(provider: WebResearchProviderConfig | undefined, kind: SymphonyWebCapabilityKind): boolean {
  if (!providerSupportsKind(provider, kind)) return false;
  const status = provider?.capabilityProbeStatus ?? "untested";
  if (status === "failed") return false;
  if (kind === "dynamic_headless_browser" || kind === "interactive_browser") {
    return status === "passed" || status === "degraded";
  }
  return true;
}

function providerEligibleForSymphonyRole(
  provider: WebResearchProviderConfig | undefined,
  role: Extract<WebResearchProviderRole, "search" | "fetch">,
  interactiveBrowserApproved: boolean,
): boolean {
  if (!provider || provider.status !== "enabled") return false;
  if (role === "search" && providerCapabilityEligible(provider, "search")) return true;
  if (role === "fetch" && (
    providerCapabilityEligible(provider, "static_fetch_extract") ||
    providerCapabilityEligible(provider, "dynamic_headless_browser")
  )) return true;
  return interactiveBrowserApproved && providerCapabilityEligible(provider, "interactive_browser");
}

function launchPolicyAllowsProviderForRole(
  providerId: string,
  role: Extract<WebResearchProviderRole, "search" | "fetch">,
  policy: ChildLaunchPolicySnapshot["webProviderOrder"] | undefined,
  interactiveBrowserApproved: boolean,
): boolean {
  if (!policy) return true;
  if (role === "search" && policy.search.includes(providerId)) return true;
  if (role === "fetch" && (
    policy.staticFetchExtract.includes(providerId) ||
    policy.dynamicHeadlessBrowser.includes(providerId)
  )) return true;
  return interactiveBrowserApproved && policy.interactiveBrowser.providers.includes(providerId);
}

function symphonyOverrideOrder(input: {
  legacyOrder: string[];
  providerById: Map<string, WebResearchProviderConfig>;
  role: Extract<WebResearchProviderRole, "search" | "fetch">;
  policy: ChildLaunchPolicySnapshot["webProviderOrder"] | undefined;
  interactiveBrowserApproved: boolean;
}): string[] {
  const eligibleOverrideOrder = input.legacyOrder.filter((providerId) =>
    providerEligibleForSymphonyRole(input.providerById.get(providerId), input.role, input.interactiveBrowserApproved) &&
    launchPolicyAllowsProviderForRole(providerId, input.role, input.policy, input.interactiveBrowserApproved),
  );
  if (!input.policy) return dedupe(eligibleOverrideOrder);
  const eligibleOverrideSet = new Set(eligibleOverrideOrder);
  return symphonyPolicyOrderForRole(input.policy, input.role, input.interactiveBrowserApproved)
    .filter((providerId) => eligibleOverrideSet.has(providerId));
}

function symphonyProviderOrder(input: {
  desiredOrder: string[];
  legacyOrder: string[];
  skippedProviderIds: Set<string>;
  providerById: Map<string, WebResearchProviderConfig>;
  role: Extract<WebResearchProviderRole, "search" | "fetch">;
  policy: ChildLaunchPolicySnapshot["webProviderOrder"] | undefined;
  interactiveBrowserApproved: boolean;
}): string[] {
  if (!input.policy) {
    return symphonyPreferenceOrder({
      desiredOrder: input.desiredOrder,
      legacyOrder: input.legacyOrder,
    });
  }
  return dedupe(input.desiredOrder.filter((providerId) =>
    !input.skippedProviderIds.has(providerId) &&
    providerEligibleForSymphonyRole(input.providerById.get(providerId), input.role, input.interactiveBrowserApproved),
  ));
}

function symphonyPolicyOrderForRole(
  policy: ChildLaunchPolicySnapshot["webProviderOrder"],
  role: Extract<WebResearchProviderRole, "search" | "fetch">,
  interactiveBrowserApproved: boolean,
): string[] {
  return dedupe(role === "search"
    ? [
        ...policy.search,
        ...(interactiveBrowserApproved ? policy.interactiveBrowser.providers : []),
      ]
    : [
        ...policy.staticFetchExtract,
        ...policy.dynamicHeadlessBrowser,
        ...(interactiveBrowserApproved ? policy.interactiveBrowser.providers : []),
      ]);
}

function symphonyPreferenceOrder(input: {
  desiredOrder: string[];
  legacyOrder: string[];
}): string[] {
  const legacySet = new Set(input.legacyOrder);
  return dedupe(input.desiredOrder.filter((providerId) => legacySet.has(providerId)));
}

function providerOrderOverrideRequested(value: unknown): boolean {
  return Array.isArray(value) && value.some((entry) => typeof entry === "string" && Boolean(entry.trim()));
}

function policyOrderFilteredByProviderEligibility(
  policyOrder: readonly string[],
  providerById: Map<string, WebResearchProviderConfig>,
  kind: SymphonyWebCapabilityKind,
): string[] {
  return policyOrder.filter((providerId) => {
    const provider = providerById.get(providerId);
    return provider?.status === "enabled" && providerCapabilityEligible(provider, kind);
  });
}

function capabilityPreferenceRank(
  providerId: string,
  kind: SymphonyWebCapabilityKind,
  preferences: Partial<Record<WebResearchProviderRole, string[]>>,
): number | undefined {
  const order = kind === "search"
    ? preferences.search
    : kind === "interactive_browser"
      ? preferences.interactive_browser
      : preferences.fetch;
  const index = order?.indexOf(providerId) ?? -1;
  return index >= 0 ? index + 1 : undefined;
}

function isSymphonyWebCapabilityKind(value: WebResearchCapabilityKind): value is SymphonyWebCapabilityKind {
  return value === "search" ||
    value === "static_fetch_extract" ||
    value === "dynamic_headless_browser" ||
    value === "interactive_browser";
}

function dedupe<T>(values: readonly T[]): T[] {
  return values.filter((value, index, list) => list.indexOf(value) === index);
}
