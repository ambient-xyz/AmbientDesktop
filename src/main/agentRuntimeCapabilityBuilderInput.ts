import type {
  CapabilityBuilderApplyRepairInput,
  CapabilityBuilderHistoryInput,
  CapabilityBuilderInstallDepsInput,
  CapabilityBuilderInstallerShape,
  CapabilityBuilderListFilesInput,
  CapabilityBuilderPreviewInput,
  CapabilityBuilderReadFileInput,
  CapabilityBuilderRegisterInput,
  CapabilityBuilderRepairPlanInput,
  CapabilityBuilderRemovalPlanInput,
  CapabilityBuilderScaffoldInput,
  CapabilityBuilderUnregisterInput,
  CapabilityBuilderUpdatePlanInput,
  CapabilityBuilderValidateInput,
  CapabilityBuilderWriteFileInput,
} from "./capabilityBuilder";
import type { AmbientInstallRoutePlan } from "./installRoutePlanner";
import { getProviderCatalogEntries, providerSelectionGuidanceForProvider, type ProviderCatalogEntry } from "./providerCatalog";

function requiredString(input: Record<string, unknown>, key: string): string {
  const value = input[key];
  if (typeof value !== "string" || !value.trim()) throw new Error(`${key} is required.`);
  return value;
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

function optionalStringArray(value: unknown): string[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) throw new Error("Expected an array of strings.");
  return value.map((item) => {
    if (typeof item !== "string") throw new Error("Expected an array of strings.");
    return item;
  });
}

function optionalStringArrayCompat(value: unknown): string[] | undefined {
  if (typeof value !== "string") return optionalStringArray(value);
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  try {
    const parsed = JSON.parse(trimmed);
    return optionalStringArray(parsed);
  } catch {
    throw new Error("Expected an array of strings.");
  }
}

function optionalBoolean(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

export interface AmbientCapabilityBuilderPlanInput {
  goal: string;
  capabilityName?: string;
  installerShape?: CapabilityBuilderInstallerShape;
  kind?: string;
  provider?: string;
  outputFileArtifacts?: string[];
  responseFormats?: string[];
  locality?: "local" | "network" | "either";
  envNames?: string[];
  networkHosts?: string[];
  modelAssets?: string[];
  notes?: string;
  providerCatalogCards?: AmbientCapabilityBuilderProviderCatalogGuidance[];
  researchPlanningRisks?: string[];
  sensitiveActionPlanningGuardrails?: string[];
}

export interface AmbientCapabilityBuilderProviderCatalogGuidance {
  id: string;
  displayName: string;
  recommendationTier: string;
  providerKind: string;
  sourceModel: string;
  capabilityArea: string;
  recommendationSummary: string;
  defaults: {
    provider?: string;
    locality?: "local" | "network" | "either";
    outputFileArtifacts?: string[];
    responseFormats?: string[];
    envNames?: string[];
    networkHosts?: string[];
    modelAssets?: string[];
  };
  ambientContract: {
    descriptorRequirements: string[];
    artifactPolicy: string;
    validationTarget: string;
  };
  secrets: Array<{ envName: string; required: boolean; capture: string }>;
  localArtifactReadiness?: {
    status: string;
    verifiedArtifacts: string[];
    missingOrBlockingArtifacts: string[];
    minimumLocalSmokeTest?: string;
  };
  runtimeState?: {
    externalService: boolean;
    serviceKind?: string;
    statePaths?: string[];
    healthCheck?: string;
    updatePolicy?: string;
  };
  costPrivacyNotes: string[];
  maintenanceNotes: string[];
  safetyBoundaries: string[];
  knownQuirks: string[];
  selectionRules: string[];
}

export interface AmbientCapabilityBuilderMcpRoutePreflightContext {
  latestInstallRouteLane?: AmbientInstallRoutePlan["lane"];
  mcpAutowirePlanned?: boolean;
}

export interface AmbientCapabilityBuilderMcpRoutePreflightResult {
  text: string;
  details: {
    runtime: "ambient-capability-builder";
    toolName: "ambient_capability_builder_plan";
    status: "mcp-route-required";
    executionSkipped: true;
    reason: string;
    nextTools: string[];
    latestInstallRouteLane?: AmbientInstallRoutePlan["lane"];
  };
}

export function ambientCapabilityBuilderPlanInput(input: Record<string, unknown>): AmbientCapabilityBuilderPlanInput {
  const locality = optionalString(input.locality);
  if (locality && !["local", "network", "either"].includes(locality)) throw new Error(`Unsupported capability locality: ${locality}`);
  const installerShape = capabilityBuilderInstallerShape(input.installerShape);
  return completeSensitiveConnectorProviderPlanInput(completeResearchProviderPlanInput(completeSearchProviderPlanInput(completeTtsProviderPlanInput({
    goal: requiredString(input, "goal").trim(),
    ...(optionalString(input.capabilityName) ? { capabilityName: optionalString(input.capabilityName) } : {}),
    ...(installerShape ? { installerShape } : {}),
    ...(optionalString(input.kind) ? { kind: optionalString(input.kind) } : {}),
    ...(optionalString(input.provider) ? { provider: optionalString(input.provider) } : {}),
    ...(optionalStringArrayCompat(input.outputFileArtifacts)?.length ? { outputFileArtifacts: optionalStringArrayCompat(input.outputFileArtifacts) } : {}),
    ...(optionalStringArrayCompat(input.outputArtifacts)?.length ? { outputFileArtifacts: optionalStringArrayCompat(input.outputArtifacts) } : {}),
    ...(optionalStringArrayCompat(input.outputFileArtifactTypes)?.length ? { outputFileArtifacts: optionalStringArrayCompat(input.outputFileArtifactTypes) } : {}),
    ...(optionalStringArray(input.responseFormats)?.length ? { responseFormats: optionalStringArray(input.responseFormats) } : {}),
    ...(locality ? { locality: locality as AmbientCapabilityBuilderPlanInput["locality"] } : {}),
    ...(optionalStringArray(input.envNames)?.length ? { envNames: optionalStringArray(input.envNames) } : {}),
    ...(optionalStringArray(input.networkHosts)?.length ? { networkHosts: optionalStringArray(input.networkHosts) } : {}),
    ...(optionalStringArray(input.modelAssets)?.length ? { modelAssets: optionalStringArray(input.modelAssets) } : {}),
    ...(optionalString(input.notes) ? { notes: optionalString(input.notes) } : {}),
  }))));
}

export function ambientCapabilityBuilderMcpRoutePreflight(
  input: AmbientCapabilityBuilderPlanInput,
  context: AmbientCapabilityBuilderMcpRoutePreflightContext = {},
): AmbientCapabilityBuilderMcpRoutePreflightResult | undefined {
  if (!capabilityBuilderPlanLooksLikeMcpSource(input) || context.mcpAutowirePlanned) return undefined;
  const nextTools = context.latestInstallRouteLane === "mcp-autowire"
    ? ["ambient_mcp_autowire_plan"]
    : ["ambient_install_route_plan", "ambient_mcp_autowire_plan"];
  const reason = context.latestInstallRouteLane === "mcp-autowire"
    ? "The latest install route classified this as MCP, but MCP autowire has not run yet."
    : "This request looks like an MCP or ToolHive install source and needs MCP route classification before Capability Builder planning.";
  const nextStep = context.latestInstallRouteLane === "mcp-autowire"
    ? "Call ambient_mcp_autowire_plan for this arbitrary GitHub/package MCP source before choosing ToolHive, Standard MCP import, guided bridge, normal app setup, or a generated wrapper."
    : "Use ambient_install_route_plan for ambiguous install routing, then ambient_mcp_autowire_plan for arbitrary GitHub/package MCP sources before choosing ToolHive, Standard MCP import, guided bridge, normal app setup, or a generated wrapper.";
  return {
    text: [
      "No Capability Builder plan created.",
      reason,
      nextStep,
    ].join("\n"),
    details: {
      runtime: "ambient-capability-builder",
      toolName: "ambient_capability_builder_plan",
      status: "mcp-route-required",
      executionSkipped: true,
      reason,
      nextTools,
      ...(context.latestInstallRouteLane ? { latestInstallRouteLane: context.latestInstallRouteLane } : {}),
    },
  };
}

function capabilityBuilderPlanLooksLikeMcpSource(input: AmbientCapabilityBuilderPlanInput): boolean {
  const text = [
    input.goal,
    input.capabilityName,
    input.kind,
    input.provider,
    input.installerShape,
    input.notes,
    ...(input.responseFormats ?? []),
    ...(input.modelAssets ?? []),
    ...(input.networkHosts ?? []),
  ].filter((value): value is string => typeof value === "string").join(" ").toLowerCase();
  return /\bmcp\b/.test(text) ||
    text.includes("model context protocol") ||
    text.includes("mcpservers") ||
    text.includes("mcp servers") ||
    text.includes("server.json") ||
    text.includes("toolhive") ||
    (/\bnpx\b/.test(text) && /\bstdio\b/.test(text) && /\b(server|protocol)\b/.test(text));
}

export function ambientCapabilityBuilderScaffoldInput(input: Record<string, unknown>): CapabilityBuilderScaffoldInput {
  const locality = optionalString(input.locality);
  if (locality && !["local", "network", "either"].includes(locality)) throw new Error(`Unsupported capability locality: ${locality}`);
  const installerShape = capabilityBuilderInstallerShape(input.installerShape);
  return completeSensitiveConnectorProviderScaffoldInput(completeSearchProviderScaffoldInput(completeTtsProviderScaffoldInput({
    ...(optionalString(input.name) ? { name: optionalString(input.name) } : {}),
    goal: requiredString(input, "goal").trim(),
    ...(installerShape ? { installerShape } : {}),
    ...(optionalString(input.kind) ? { kind: optionalString(input.kind) } : {}),
    ...(optionalString(input.provider) ? { provider: optionalString(input.provider) } : {}),
    ...(optionalStringArray(input.outputFileArtifactTypes)?.length ? { outputArtifactTypes: optionalStringArray(input.outputFileArtifactTypes) } : {}),
    ...(optionalStringArray(input.outputArtifactTypes)?.length ? { outputArtifactTypes: optionalStringArray(input.outputArtifactTypes) } : {}),
    ...(optionalStringArray(input.responseFormats)?.length ? { responseFormats: optionalStringArray(input.responseFormats) } : {}),
    ...(locality ? { locality: locality as CapabilityBuilderScaffoldInput["locality"] } : {}),
    ...(optionalStringArray(input.envNames)?.length ? { envNames: optionalStringArray(input.envNames) } : {}),
    ...(optionalStringArray(input.networkHosts)?.length ? { networkHosts: optionalStringArray(input.networkHosts) } : {}),
    ...(optionalStringArray(input.modelAssets)?.length ? { modelAssets: optionalStringArray(input.modelAssets) } : {}),
  })));
}

function completeTtsProviderPlanInput(input: AmbientCapabilityBuilderPlanInput): AmbientCapabilityBuilderPlanInput {
  const installerShape = input.installerShape ?? inferTtsProviderInstallerShape(input);
  if (installerShape !== "tts-provider") return input;
  const providerCard = selectProviderCatalogCard(input, "voice-generation", "tts-provider");
  const providerHints = providerCatalogHints(providerCard);
  return {
    ...input,
    installerShape,
    ...(providerHints.provider && !input.provider ? { provider: providerHints.provider } : {}),
    ...(providerHints.locality && !input.locality ? { locality: providerHints.locality } : {}),
    ...(providerHints.outputFileArtifacts.length && !input.outputFileArtifacts?.length ? { outputFileArtifacts: providerHints.outputFileArtifacts } : {}),
    envNames: mergeUniqueStrings(input.envNames, providerHints.envNames),
    networkHosts: mergeUniqueStrings(input.networkHosts, providerHints.networkHosts),
    modelAssets: mergeUniqueStrings(input.modelAssets, providerHints.modelAssets),
    ...(providerHints.notes && !input.notes ? { notes: providerHints.notes } : {}),
    providerCatalogCards: mergeProviderCatalogGuidance(input.providerCatalogCards, providerCard),
  };
}

function completeTtsProviderScaffoldInput(input: CapabilityBuilderScaffoldInput): CapabilityBuilderScaffoldInput {
  const installerShape = input.installerShape ?? inferTtsProviderInstallerShape(input);
  if (installerShape !== "tts-provider") return input;
  const providerCard = selectProviderCatalogCard(input, "voice-generation", "tts-provider");
  const providerHints = providerCatalogHints(providerCard);
  return {
    ...input,
    installerShape,
    ...(providerHints.provider && !input.provider ? { provider: providerHints.provider } : {}),
    ...(providerHints.locality && !input.locality ? { locality: providerHints.locality } : {}),
    ...(providerHints.outputFileArtifacts.length && !input.outputArtifactTypes?.length ? { outputArtifactTypes: providerHints.outputFileArtifacts } : {}),
    envNames: mergeUniqueStrings(input.envNames, providerHints.envNames),
    networkHosts: mergeUniqueStrings(input.networkHosts, providerHints.networkHosts),
    modelAssets: mergeUniqueStrings(input.modelAssets, providerHints.modelAssets),
  };
}

function completeSearchProviderPlanInput(input: AmbientCapabilityBuilderPlanInput): AmbientCapabilityBuilderPlanInput {
  const installerShape = input.installerShape ?? inferSearchProviderInstallerShape(input);
  if (installerShape !== "search-provider") return input;
  const providerCard = selectProviderCatalogCard(input, "web-search", "search-provider");
  const providerHints = providerCatalogHints(providerCard);
  const responseFormats = input.responseFormats?.length
    ? input.responseFormats
    : providerHints.responseFormats.length
      ? providerHints.responseFormats
    : /\bjson\b/i.test(input.goal)
      ? ["JSON"]
      : ["text"];
  return {
    ...input,
    installerShape,
    ...(providerHints.provider && !input.capabilityName ? { capabilityName: suggestedCapabilityPackageName(providerHints.provider, undefined) } : {}),
    ...(providerHints.provider && !input.provider ? { provider: providerHints.provider } : {}),
    ...(providerHints.locality && !input.locality ? { locality: providerHints.locality } : {}),
    responseFormats,
    envNames: mergeUniqueStrings(input.envNames, providerHints.envNames),
    networkHosts: mergeUniqueStrings(input.networkHosts, providerHints.networkHosts),
    modelAssets: mergeUniqueStrings(input.modelAssets, providerHints.modelAssets),
    ...(providerHints.notes && !input.notes ? { notes: providerHints.notes } : {}),
    providerCatalogCards: mergeProviderCatalogGuidance(input.providerCatalogCards, providerCard),
  };
}

function completeSearchProviderScaffoldInput(input: CapabilityBuilderScaffoldInput): CapabilityBuilderScaffoldInput {
  const installerShape = input.installerShape ?? inferSearchProviderInstallerShape(input);
  if (installerShape !== "search-provider") return input;
  const providerCard = selectProviderCatalogCard(input, "web-search", "search-provider");
  const providerHints = providerCatalogHints(providerCard);
  const responseFormats = input.responseFormats?.length
    ? input.responseFormats
    : providerHints.responseFormats.length
      ? providerHints.responseFormats
    : /\bjson\b/i.test(input.goal)
      ? ["JSON"]
      : ["text"];
  return {
    ...input,
    installerShape,
    ...(providerHints.provider && !input.name ? { name: providerHints.provider } : {}),
    ...(providerHints.provider && !input.provider ? { provider: providerHints.provider } : {}),
    ...(providerHints.locality && !input.locality ? { locality: providerHints.locality } : {}),
    responseFormats,
    envNames: mergeUniqueStrings(input.envNames, providerHints.envNames),
    networkHosts: mergeUniqueStrings(input.networkHosts, providerHints.networkHosts),
    modelAssets: mergeUniqueStrings(input.modelAssets, providerHints.modelAssets),
  };
}

function completeResearchProviderPlanInput(input: AmbientCapabilityBuilderPlanInput): AmbientCapabilityBuilderPlanInput {
  const providerCard = selectResearchProviderCatalogCard(input);
  const researchLike = Boolean(providerCard) || isRetrievalOrDeepResearchPlan(input);
  if (!researchLike) return input;
  const providerHints = providerCatalogHints(providerCard);
  const responseFormats = input.responseFormats?.length
    ? input.responseFormats
    : providerHints.responseFormats.length
      ? providerHints.responseFormats
      : ["text", "JSON"];
  const risks = researchPlanningRiskNotes(providerCard, input);
  return {
    ...input,
    installerShape: input.installerShape ?? "custom-cli",
    ...(providerHints.provider && !input.provider ? { provider: providerHints.provider } : {}),
    ...(providerHints.locality && !input.locality ? { locality: providerHints.locality } : {}),
    responseFormats,
    envNames: mergeUniqueStrings(input.envNames, providerHints.envNames),
    networkHosts: mergeUniqueStrings(input.networkHosts, providerHints.networkHosts),
    modelAssets: mergeUniqueStrings(input.modelAssets, providerHints.modelAssets),
    ...(providerHints.notes && !input.notes ? { notes: providerHints.notes } : {}),
    providerCatalogCards: mergeProviderCatalogGuidance(input.providerCatalogCards, providerCard),
    researchPlanningRisks: mergeUniqueStrings(input.researchPlanningRisks, risks),
  };
}

function completeSensitiveConnectorProviderPlanInput(input: AmbientCapabilityBuilderPlanInput): AmbientCapabilityBuilderPlanInput {
  const installerShape = input.installerShape ?? inferSensitiveConnectorInstallerShape(input);
  if (installerShape !== "connector") return input;
  const providerCard = selectSensitiveConnectorProviderCatalogCard(input);
  const providerHints = providerCatalogHints(providerCard);
  const responseFormats = input.responseFormats?.length
    ? input.responseFormats
    : providerHints.responseFormats.length
      ? providerHints.responseFormats
      : ["JSON"];
  const guardrails = sensitiveConnectorPlanningGuardrails(providerCard);
  return {
    ...input,
    installerShape,
    ...(providerHints.provider && !input.provider ? { provider: providerHints.provider } : {}),
    ...(providerHints.locality && !input.locality ? { locality: providerHints.locality } : {}),
    responseFormats,
    envNames: mergeUniqueStrings(input.envNames, providerHints.envNames),
    networkHosts: mergeUniqueStrings(input.networkHosts, providerHints.networkHosts),
    modelAssets: mergeUniqueStrings(input.modelAssets, providerHints.modelAssets),
    ...(providerHints.notes && !input.notes ? { notes: providerHints.notes } : {}),
    providerCatalogCards: mergeProviderCatalogGuidance(input.providerCatalogCards, providerCard),
    sensitiveActionPlanningGuardrails: mergeUniqueStrings(input.sensitiveActionPlanningGuardrails, guardrails),
  };
}

function completeSensitiveConnectorProviderScaffoldInput(input: CapabilityBuilderScaffoldInput): CapabilityBuilderScaffoldInput {
  const installerShape = input.installerShape ?? inferSensitiveConnectorInstallerShape(input);
  if (installerShape !== "connector") return input;
  const providerCard = selectSensitiveConnectorProviderCatalogCard(input);
  const providerHints = providerCatalogHints(providerCard);
  const responseFormats = input.responseFormats?.length
    ? input.responseFormats
    : providerHints.responseFormats.length
      ? providerHints.responseFormats
      : ["JSON"];
  return {
    ...input,
    installerShape,
    ...(providerHints.provider && !input.provider ? { provider: providerHints.provider } : {}),
    ...(providerHints.locality && !input.locality ? { locality: providerHints.locality } : {}),
    responseFormats,
    envNames: mergeUniqueStrings(input.envNames, providerHints.envNames),
    networkHosts: mergeUniqueStrings(input.networkHosts, providerHints.networkHosts),
    modelAssets: mergeUniqueStrings(input.modelAssets, providerHints.modelAssets),
  };
}

function inferTtsProviderInstallerShape(input: Pick<AmbientCapabilityBuilderPlanInput, "goal" | "kind" | "provider">): CapabilityBuilderInstallerShape | undefined {
  const goal = input.goal.toLowerCase();
  const kind = (input.kind ?? "").toLowerCase();
  const provider = (input.provider ?? "").toLowerCase();
  if (kind.includes("tts-provider") || kind.includes("voice provider") || goal.includes("tts-provider") || goal.includes("voice provider")) return "tts-provider";
  if (!catalogHasProviderText("voice-generation", "tts-provider", provider, goal)) return undefined;
  if (
    goal.includes("assistant voice") ||
    goal.includes("voice output") ||
    goal.includes("read chats") ||
    goal.includes("read chat") ||
    goal.includes("read aloud") ||
    goal.includes("read-aloud") ||
    /read\b.*\baloud/.test(goal) ||
    goal.includes("read back") ||
    goal.includes("speak assistant") ||
    /speak\b.*\bassistant/.test(goal) ||
    goal.includes("spoken assistant") ||
    goal.includes("chat voicing") ||
    goal.includes("ambient voice")
  ) {
    return "tts-provider";
  }
  return undefined;
}

function inferSearchProviderInstallerShape(input: Pick<AmbientCapabilityBuilderPlanInput, "goal" | "kind" | "provider">): CapabilityBuilderInstallerShape | undefined {
  const goal = input.goal.toLowerCase();
  const kind = (input.kind ?? "").toLowerCase();
  const provider = (input.provider ?? "").toLowerCase();
  if (kind.includes("search-provider") || kind.includes("search provider")) return "search-provider";
  if (catalogHasProviderText("web-search", "search-provider", provider, goal)) return "search-provider";
  if ((provider.includes("search") || goal.includes("search")) && (kind.includes("connector") || kind.includes("api") || kind.includes("search"))) {
    return "search-provider";
  }
  return undefined;
}

function inferSensitiveConnectorInstallerShape(input: Pick<AmbientCapabilityBuilderPlanInput, "goal" | "kind" | "provider">): CapabilityBuilderInstallerShape | undefined {
  const goal = input.goal.toLowerCase();
  const kind = (input.kind ?? "").toLowerCase();
  const provider = (input.provider ?? "").toLowerCase();
  if (kind.includes("connector") || kind.includes("oauth") || kind.includes("social") || kind.includes("payment") || kind.includes("banking")) return "connector";
  if (catalogHasProviderText("social-media", "connector", provider, goal)) return "connector";
  if (catalogHasProviderText("agentic-services", "connector", provider, goal)) return "connector";
  if (/\b(bluesky|at protocol|atproto|mastodon|fediverse|x api|linkedin|social post|social media|post to social)\b/.test(`${provider} ${goal}`)) return "connector";
  if (/\b(stripe|payment|refund|charge|subscription|invoice|agentic service|banking)\b/.test(`${provider} ${goal}`)) return "connector";
  return undefined;
}

function providerCatalogHints(provider: ProviderCatalogEntry | undefined): {
  provider?: string;
  locality?: "local" | "network" | "either";
  outputFileArtifacts: string[];
  responseFormats: string[];
  envNames: string[];
  networkHosts: string[];
  modelAssets: string[];
  notes?: string;
} {
  if (!provider) return { outputFileArtifacts: [], responseFormats: [], envNames: [], networkHosts: [], modelAssets: [] };
  const defaults = provider.capabilityBuilderDefaults ?? {};
  const envNames = defaults.envNames ?? provider.secrets.map((secret) => secret.envName);
  const networkHosts = defaults.networkHosts ?? provider.networkHosts;
  const modelAssets = defaults.modelAssets ?? provider.modelAssets.map((asset) => asset.name);
  const outputFileArtifacts = normalizePlanArtifactTypes(defaults.outputFileArtifacts ?? []);
  const responseFormats = normalizePlanResponseFormats(defaults.responseFormats ?? []);
  const notes = providerCatalogPlanNote(provider, outputFileArtifacts);
  return {
    ...(defaults.provider ? { provider: defaults.provider } : { provider: provider.displayName }),
    ...(defaults.locality ? { locality: defaults.locality } : {}),
    outputFileArtifacts,
    responseFormats,
    envNames,
    networkHosts,
    modelAssets,
    notes,
  };
}

function selectProviderCatalogCard(
  input: Pick<AmbientCapabilityBuilderPlanInput, "goal" | "provider">,
  capabilityArea: ProviderCatalogEntry["capabilityArea"],
  installerShape: ProviderCatalogEntry["installerShape"],
): ProviderCatalogEntry | undefined {
  const matches = getProviderCatalogEntries()
    .filter((entry) => entry.capabilityArea === capabilityArea && entry.installerShape === installerShape)
    .filter((entry) => providerCatalogCardMatchesText(entry, input.provider, input.goal))
    .sort(compareProviderCatalogCardsForPlanning);
  return matches[0];
}

function catalogHasProviderText(
  capabilityArea: ProviderCatalogEntry["capabilityArea"],
  installerShape: ProviderCatalogEntry["installerShape"],
  provider: string,
  goal: string,
): boolean {
  return Boolean(selectProviderCatalogCard({ provider, goal }, capabilityArea, installerShape));
}

function selectResearchProviderCatalogCard(input: Pick<AmbientCapabilityBuilderPlanInput, "goal" | "provider">): ProviderCatalogEntry | undefined {
  return [
    selectProviderCatalogCard(input, "retrieval", "custom-cli"),
    selectProviderCatalogCard(input, "deep-research", "custom-cli"),
  ].filter((entry): entry is ProviderCatalogEntry => Boolean(entry)).sort(compareProviderCatalogCardsForPlanning)[0];
}

function selectSensitiveConnectorProviderCatalogCard(input: Pick<AmbientCapabilityBuilderPlanInput, "goal" | "provider">): ProviderCatalogEntry | undefined {
  return [
    selectProviderCatalogCard(input, "social-media", "connector"),
    selectProviderCatalogCard(input, "agentic-services", "connector"),
  ].filter((entry): entry is ProviderCatalogEntry => Boolean(entry)).sort(compareProviderCatalogCardsForPlanning)[0];
}

function isRetrievalOrDeepResearchPlan(input: Pick<AmbientCapabilityBuilderPlanInput, "goal" | "kind" | "provider" | "installerShape">): boolean {
  const text = `${input.goal} ${input.kind ?? ""} ${input.provider ?? ""}`.toLowerCase();
  if (input.installerShape === "custom-cli" && /\b(deep research|research agent|retrieval|retriever|corpus|index|colbert)\b/.test(text)) return true;
  return /\b(deep research|research agent|researcher agent|research workflow|retrieval provider|retriever|reasoning retrieval|corpus index|colbert)\b/.test(text);
}

function researchPlanningRiskNotes(provider: ProviderCatalogEntry | undefined, input: AmbientCapabilityBuilderPlanInput): string[] {
  const base = [
    "Require an explicit corpus/index state plan: corpus provenance, index location, refresh policy, and cleanup/rollback path.",
    "Require a model-serving/runtime plan before install: model assets, accelerator assumptions, context length, memory/disk footprint, and health checks.",
    "Keep search, scraping/browsering, retrieval, model inference, report synthesis, source citations, and trace artifacts as separate responsibilities in the descriptor and tests.",
    "Validation must run a bounded fixed task and save trace/source/report artifacts; a health check or import-only test is not enough.",
  ];
  if (!provider) {
    return [
      "No known provider catalog card matched this retrieval/deep-research request; treat it as higher validation risk until docs, artifacts, tool protocol, and smoke-test evidence are reviewed.",
      ...base,
    ];
  }
  const readiness = provider.localArtifactReadiness;
  return [
    `Catalog card ${provider.id} is ${provider.recommendationTier}; do not present it as a default or one-click provider until Ambient/Pi dogfood promotes it.`,
    readiness
      ? `Local artifact readiness is ${readiness.status}; missing/blocking items: ${readiness.missingOrBlockingArtifacts.join(", ") || "none declared"}.`
      : "Local artifact readiness is not declared; require artifact review before install planning.",
    ...base,
    ...(provider.capabilityArea === "deep-research"
      ? ["Deep-research setup must include external search/scrape dependencies, source citation behavior, cost/latency bounds, and failure recovery before usability claims."]
      : ["Retrieval setup must compare against a deterministic baseline such as BM25/SQLite FTS before claiming quality improvements."]),
  ];
}

function sensitiveConnectorPlanningGuardrails(provider: ProviderCatalogEntry | undefined): string[] {
  const base = [
    "Plan read-only status/identity checks and draft/preview commands before any externally visible or money-affecting write command.",
    "Separate preview and apply/mutation commands in the descriptor; apply commands must require explicit user approval, exact target account/object confirmation, and an audit record.",
    "Use Ambient-managed secret capture only; do not ask users to paste OAuth tokens, API keys, app passwords, session JWTs, or webhook secrets into chat.",
    "Validation must start with read-only or sandbox checks; write smoke tests require credentials plus explicit approval and must save sanitized request ids/object ids/output ids.",
  ];
  if (!provider) {
    return [
      "No known provider catalog card matched this connector request; treat it as higher safety and validation risk until docs, scopes, permissions, and rollback behavior are reviewed.",
      ...base,
    ];
  }
  if (provider.capabilityArea === "social-media") {
    return [
      `Catalog card ${provider.id} is ${provider.recommendationTier}; social actions are public/reputation-affecting and must not be autonomous.`,
      ...base,
      "Social writes must preview exact text, media, alt text, reply/quote/repost targets, visibility/distribution, account identity, and delete/redraft behavior before approval.",
      "Do not bypass official APIs or platform consent/rate-limit/policy boundaries with browser internals or scraped private endpoints.",
    ];
  }
  if (provider.capabilityArea === "agentic-services") {
    return [
      `Catalog card ${provider.id} is ${provider.recommendationTier}; agentic service actions are high risk and must stay sandbox-only/read/draft-first in V1.`,
      ...base,
      "Money-affecting actions must include typed preview, sandbox/live-mode guard, amount/currency/object ids, idempotency key, rollback/reversal limits, and audit id.",
      "Reject live payment/banking keys and autonomous money movement until a separate high-risk approval and audit system exists.",
    ];
  }
  return base;
}

function providerCatalogCardMatchesText(entry: ProviderCatalogEntry, provider: string | undefined, goal: string): boolean {
  const providerText = compactProviderSearchText(provider ?? "");
  const goalText = compactProviderSearchText(goal);
  const aliases = providerCatalogAliases(entry);
  if (providerText) {
    return aliases.some((alias) => alias === providerText || alias.includes(providerText) || providerText.includes(alias));
  }
  return aliases.some((alias) => alias.length >= 4 && goalText.includes(alias));
}

function providerCatalogAliases(entry: ProviderCatalogEntry): string[] {
  return [
    entry.id.split(".").slice(1).join(" "),
    entry.displayName,
    entry.capabilityBuilderDefaults?.provider,
    entry.firstPartyTemplate?.templateId,
  ]
    .filter((value): value is string => Boolean(value?.trim()))
    .flatMap((value) => [value, value.replace(/\bapi\b/gi, ""), value.replace(/\([^)]*\)/g, "")])
    .map(compactProviderSearchText)
    .filter((value) => value.length >= 3);
}

function compactProviderSearchText(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function compareProviderCatalogCardsForPlanning(left: ProviderCatalogEntry, right: ProviderCatalogEntry): number {
  const tierDelta = providerPlanningTierRank(left.recommendationTier) - providerPlanningTierRank(right.recommendationTier);
  if (tierDelta !== 0) return tierDelta;
  return left.displayName.localeCompare(right.displayName);
}

function providerPlanningTierRank(tier: ProviderCatalogEntry["recommendationTier"]): number {
  switch (tier) {
    case "default": return 0;
    case "recommended": return 1;
    case "conditional": return 2;
    case "experimental": return 3;
    case "research-needed": return 4;
    case "not-recommended": return 5;
    default: return 9;
  }
}

function normalizePlanArtifactTypes(values: string[]): string[] {
  return values.map((value) => value.trim().toUpperCase()).filter(Boolean);
}

function normalizePlanResponseFormats(values: string[]): string[] {
  return values.map((value) => {
    const trimmed = value.trim();
    return trimmed.toLowerCase() === "json" ? "JSON" : trimmed;
  }).filter(Boolean);
}

function providerCatalogPlanNote(provider: ProviderCatalogEntry, outputFileArtifacts: string[]): string {
  const parts: string[] = [];
  if (provider.firstPartyTemplate?.available) {
    parts.push(`Use the first-party ${provider.displayName} ${provider.installerShape ?? "provider"} template`);
  } else {
    parts.push(`Use provider catalog card ${provider.id} as the planning contract`);
  }
  if (provider.secrets.length) {
    parts.push(`request ${provider.secrets.map((secret) => secret.envName).join(", ")} through ambient_capability_builder_secret_request before validation`);
  }
  if (provider.runtimeState?.externalService && provider.runtimeState.serviceKind && provider.runtimeState.serviceKind !== "hosted-api") {
    parts.push(`manage ${provider.runtimeState.serviceKind} runtime state explicitly`);
  }
  if (outputFileArtifacts.length) {
    parts.push(`validate with one tiny ${outputFileArtifacts.join("/")} output`);
  } else {
    parts.push(`validation target: ${provider.ambientContract.validationTarget}`);
  }
  return `${parts.join("; ")}.`;
}

function mergeProviderCatalogGuidance(
  existing: AmbientCapabilityBuilderProviderCatalogGuidance[] | undefined,
  provider: ProviderCatalogEntry | undefined,
): AmbientCapabilityBuilderProviderCatalogGuidance[] | undefined {
  if (!provider) return existing;
  const next = [...(existing ?? [])];
  if (next.some((item) => item.id === provider.id)) return next;
  next.push(providerCatalogGuidance(provider));
  return next;
}

function providerCatalogGuidance(provider: ProviderCatalogEntry): AmbientCapabilityBuilderProviderCatalogGuidance {
  const defaults = provider.capabilityBuilderDefaults ?? {};
  return {
    id: provider.id,
    displayName: provider.displayName,
    recommendationTier: provider.recommendationTier,
    providerKind: provider.providerKind,
    sourceModel: provider.sourceModel,
    capabilityArea: provider.capabilityArea,
    recommendationSummary: provider.recommendationSummary,
    defaults: {
      ...(defaults.provider ? { provider: defaults.provider } : {}),
      ...(defaults.locality ? { locality: defaults.locality } : {}),
      ...(defaults.outputFileArtifacts?.length ? { outputFileArtifacts: normalizePlanArtifactTypes(defaults.outputFileArtifacts) } : {}),
      ...(defaults.responseFormats?.length ? { responseFormats: normalizePlanResponseFormats(defaults.responseFormats) } : {}),
      ...(defaults.envNames?.length ? { envNames: [...defaults.envNames] } : {}),
      ...(defaults.networkHosts?.length ? { networkHosts: [...defaults.networkHosts] } : {}),
      ...(defaults.modelAssets?.length ? { modelAssets: [...defaults.modelAssets] } : {}),
    },
    ambientContract: {
      descriptorRequirements: [...provider.ambientContract.descriptorRequirements],
      artifactPolicy: provider.ambientContract.artifactPolicy,
      validationTarget: provider.ambientContract.validationTarget,
    },
    secrets: provider.secrets.map((secret) => ({ envName: secret.envName, required: secret.required, capture: secret.capture })),
    ...(provider.localArtifactReadiness ? {
      localArtifactReadiness: {
        status: provider.localArtifactReadiness.status,
        verifiedArtifacts: [...provider.localArtifactReadiness.verifiedArtifacts],
        missingOrBlockingArtifacts: [...provider.localArtifactReadiness.missingOrBlockingArtifacts],
        ...(provider.localArtifactReadiness.minimumLocalSmokeTest ? { minimumLocalSmokeTest: provider.localArtifactReadiness.minimumLocalSmokeTest } : {}),
      },
    } : {}),
    ...(provider.runtimeState ? {
      runtimeState: {
        externalService: provider.runtimeState.externalService,
        ...(provider.runtimeState.serviceKind ? { serviceKind: provider.runtimeState.serviceKind } : {}),
        ...(provider.runtimeState.statePaths?.length ? { statePaths: [...provider.runtimeState.statePaths] } : {}),
        ...(provider.runtimeState.healthCheck ? { healthCheck: provider.runtimeState.healthCheck } : {}),
        ...(provider.runtimeState.updatePolicy ? { updatePolicy: provider.runtimeState.updatePolicy } : {}),
      },
    } : {}),
    costPrivacyNotes: [...provider.costPrivacyNotes],
    maintenanceNotes: [...provider.maintenanceNotes],
    safetyBoundaries: [...provider.safetyBoundaries],
    knownQuirks: [...provider.knownQuirks],
    selectionRules: providerSelectionGuidanceForProvider(provider),
  };
}

function mergeUniqueStrings(existing: string[] | undefined, additions: string[]): string[] | undefined {
  const values = [...(existing ?? []), ...additions].map((value) => value.trim()).filter(Boolean);
  if (!values.length) return existing;
  return Array.from(new Set(values));
}

function capabilityBuilderInstallerShape(value: unknown): CapabilityBuilderInstallerShape | undefined {
  const shape = optionalString(value);
  if (!shape) return undefined;
  if (
    shape === "tts-provider" ||
    shape === "artifact-generator" ||
    shape === "file-converter" ||
    shape === "search-provider" ||
    shape === "browser-tooling" ||
    shape === "connector" ||
    shape === "custom-cli"
  ) {
    return shape;
  }
  throw new Error(`Unsupported capability installerShape: ${shape}`);
}

export function ambientCapabilityBuilderPreviewInput(input: Record<string, unknown>): CapabilityBuilderPreviewInput {
  const packageName = optionalString(input.packageName);
  const path = optionalString(input.path);
  const sourcePath = optionalString(input.sourcePath);
  if (!packageName && !path && !sourcePath) throw new Error("packageName, path, or sourcePath is required.");
  return {
    ...(packageName ? { packageName } : {}),
    ...(path ? { path } : {}),
    ...(sourcePath ? { sourcePath } : {}),
  };
}

export function ambientCapabilityBuilderListFilesInput(input: Record<string, unknown>): CapabilityBuilderListFilesInput {
  return ambientCapabilityBuilderPreviewInput(input);
}

export function ambientCapabilityBuilderReadFileInput(input: Record<string, unknown>): CapabilityBuilderReadFileInput {
  const maxChars = typeof input.maxChars === "number" && Number.isFinite(input.maxChars) ? input.maxChars : undefined;
  return {
    ...ambientCapabilityBuilderPreviewInput(input),
    filePath: requiredString(input, "filePath").trim(),
    ...(maxChars !== undefined ? { maxChars } : {}),
  };
}

export function ambientCapabilityBuilderWriteFileInput(input: Record<string, unknown>): CapabilityBuilderWriteFileInput {
  if (typeof input.content !== "string") throw new Error("content is required.");
  return {
    ...ambientCapabilityBuilderPreviewInput(input),
    filePath: requiredString(input, "filePath").trim(),
    content: input.content,
    reason: requiredString(input, "reason").trim(),
  };
}

export function ambientCapabilityBuilderSecretRequestInput(input: Record<string, unknown>): CapabilityBuilderPreviewInput & { envName: string } {
  return {
    ...ambientCapabilityBuilderPreviewInput(input),
    envName: requiredString(input, "envName").trim(),
  };
}

export function ambientCapabilityBuilderHistoryInput(input: Record<string, unknown>): CapabilityBuilderHistoryInput {
  const includeRegistered = optionalBoolean(input.includeRegistered);
  const includeDrafts = optionalBoolean(input.includeDrafts);
  return {
    ...(optionalString(input.packageName) ? { packageName: optionalString(input.packageName) } : {}),
    ...(includeRegistered !== undefined ? { includeRegistered } : {}),
    ...(includeDrafts !== undefined ? { includeDrafts } : {}),
  };
}

export function ambientCapabilityBuilderUpdatePlanInput(input: Record<string, unknown>): CapabilityBuilderUpdatePlanInput {
  const base = ambientCapabilityBuilderPreviewInput(input);
  return {
    ...base,
    ...(optionalString(input.requestedChanges) ? { requestedChanges: optionalString(input.requestedChanges) } : {}),
    ...(optionalString(input.targetVersion) ? { targetVersion: optionalString(input.targetVersion) } : {}),
    ...(optionalString(input.notes) ? { notes: optionalString(input.notes) } : {}),
  };
}

export function ambientCapabilityBuilderRepairPlanInput(input: Record<string, unknown>): CapabilityBuilderRepairPlanInput {
  const base = ambientCapabilityBuilderPreviewInput(input);
  return {
    ...base,
    ...(optionalString(input.requestedRepair) ? { requestedRepair: optionalString(input.requestedRepair) } : {}),
    ...(optionalString(input.notes) ? { notes: optionalString(input.notes) } : {}),
  };
}

export function ambientCapabilityBuilderApplyRepairInput(input: Record<string, unknown>): CapabilityBuilderApplyRepairInput {
  const base = ambientCapabilityBuilderPreviewInput(input);
  if (!Array.isArray(input.files) || !input.files.length) throw new Error("files must be a non-empty array.");
  return {
    ...base,
    reason: requiredString(input, "reason").trim(),
    files: input.files.map((item, index) => {
      if (!item || typeof item !== "object" || Array.isArray(item)) throw new Error(`files[${index}] must be an object.`);
      const file = item as Record<string, unknown>;
      if (typeof file.content !== "string") throw new Error(`files[${index}].content is required.`);
      return {
        path: requiredString(file, "path").trim(),
        content: file.content,
        rationale: requiredString(file, "rationale").trim(),
      };
    }),
  };
}

export function ambientCapabilityBuilderRemovalPlanInput(input: Record<string, unknown>): CapabilityBuilderRemovalPlanInput {
  const base = ambientCapabilityBuilderPreviewInput(input);
  return {
    ...base,
    ...(optionalString(input.installedPackageId) ? { installedPackageId: optionalString(input.installedPackageId) } : {}),
    ...(optionalString(input.installedSource) ? { installedSource: optionalString(input.installedSource) } : {}),
    ...(optionalString(input.reason) ? { reason: optionalString(input.reason) } : {}),
    ...(optionalString(input.notes) ? { notes: optionalString(input.notes) } : {}),
  };
}

export function ambientCapabilityBuilderUnregisterInput(input: Record<string, unknown>): CapabilityBuilderUnregisterInput {
  const base = ambientCapabilityBuilderRemovalPlanInput(input);
  const preserveBuilderSource = optionalBoolean(input.preserveBuilderSource);
  if (preserveBuilderSource === false) throw new Error("preserveBuilderSource=false is not supported by ambient_capability_builder_unregister.");
  return {
    ...base,
    ...(preserveBuilderSource !== undefined ? { preserveBuilderSource } : {}),
  };
}

export function ambientCapabilityBuilderInstallDepsInput(input: Record<string, unknown>): CapabilityBuilderInstallDepsInput {
  const base = ambientCapabilityBuilderPreviewInput(input);
  if (!Array.isArray(input.commands) || !input.commands.length) throw new Error("commands must be a non-empty array.");
  return {
    ...base,
    commands: input.commands.map((item, index) => {
      if (!item || typeof item !== "object" || Array.isArray(item)) throw new Error(`commands[${index}] must be an object.`);
      const command = item as Record<string, unknown>;
      const args = optionalStringArray(command.args);
      return {
        command: requiredString(command, "command").trim(),
        ...(args?.length ? { args } : {}),
        ...(optionalString(command.cwd) ? { cwd: optionalString(command.cwd) } : {}),
        rationale: requiredString(command, "rationale").trim(),
      };
    }),
  };
}

export function ambientCapabilityBuilderValidateInput(input: Record<string, unknown>): CapabilityBuilderValidateInput {
  const base = ambientCapabilityBuilderPreviewInput(input);
  const includeSmokeTests = optionalBoolean(input.includeSmokeTests);
  return {
    ...base,
    ...(includeSmokeTests !== undefined ? { includeSmokeTests } : {}),
  };
}

export function ambientCapabilityBuilderRegisterInput(input: Record<string, unknown>): CapabilityBuilderRegisterInput {
  return ambientCapabilityBuilderPreviewInput(input);
}

export function ambientCapabilityBuilderPlanText(input: AmbientCapabilityBuilderPlanInput): string {
  const name = input.capabilityName ?? suggestedCapabilityPackageName(input.goal, input.provider);
  const artifacts = input.outputFileArtifacts?.length ? input.outputFileArtifacts.join(", ") : "none unless the capability intentionally creates files";
  const responseFormats = input.responseFormats?.length ? input.responseFormats.join(", ") : input.installerShape === "search-provider" ? "JSON/text stdout" : "unspecified";
  const locality = input.locality ?? "either";
  const providerCatalogCards = input.providerCatalogCards?.length ? input.providerCatalogCards : inferredProviderCatalogGuidance(input);
  return [
    "Ambient Capability Builder plan",
    "",
    `Goal: ${input.goal}`,
    `Proposed package name: ${name}`,
    `Installer shape: ${input.installerShape ?? "unspecified"}`,
    `Kind: ${input.kind ?? "Ambient CLI package"}`,
    `Provider/runtime: ${input.provider ?? "to be selected during design"}`,
    `Execution locality: ${locality}`,
    `File artifacts: ${artifacts}`,
    `Response formats: ${responseFormats}`,
    `Env requirements: ${input.envNames?.length ? input.envNames.join(", ") : locality === "network" ? "declare required API secrets by env name before validation/use" : "none specified yet"}`,
    `Network hosts: ${input.networkHosts?.length ? input.networkHosts.join(", ") : locality === "network" ? "declare exact API hosts before validation/use" : "none specified yet"}`,
    `Model/assets: ${input.modelAssets?.length ? input.modelAssets.join(", ") : "none specified yet"}`,
    input.notes ? `Notes: ${input.notes}` : undefined,
    providerCatalogCards.length ? [
      "",
      "Provider catalog guidance:",
      ...providerCatalogCards.flatMap(formatProviderCatalogGuidanceForPlan),
    ].join("\n") : undefined,
    input.researchPlanningRisks?.length ? [
      "",
      "Retrieval/deep-research planning guardrails:",
      ...input.researchPlanningRisks.map((risk) => `- ${risk}`),
    ].join("\n") : undefined,
    input.sensitiveActionPlanningGuardrails?.length ? [
      "",
      "Social/agentic connector planning guardrails:",
      ...input.sensitiveActionPlanningGuardrails.map((risk) => `- ${risk}`),
    ].join("\n") : undefined,
    "",
    "Package shape:",
    input.installerShape === "tts-provider"
      ? "- tts-provider descriptor command with voiceProvider metadata, normalized synthesis args, JSON stdout, audio artifact output, health checks, and Ambient voice runtime compatibility."
      : undefined,
    input.installerShape === "search-provider"
      ? "- search-provider commands should return concise JSON/text on stdout by default. Declare file artifacts only when the command intentionally writes export/cache files."
      : undefined,
    input.installerShape === "connector"
      ? "- connector commands must separate read/status, draft/preview, and apply/mutation paths; mutation commands require explicit approval, exact target confirmation, idempotency where applicable, and audit metadata."
      : undefined,
    input.researchPlanningRisks?.length
      ? "- retrieval/deep-research commands must separate corpus/index state, search/scrape/browser dependencies, model serving, trace artifacts, source citations, and report synthesis."
      : undefined,
    "- ambient-cli.json declaring metadata, commands, args, cwd policy, env requirements, health checks, and artifact output expectations.",
    "- Descriptor command and healthCheck executables must be bare executable names such as `node`, `uv`, or `python`, or package-relative paths such as `./bin/tool`; never use absolute host paths like `/usr/local/bin/node` because Ambient injects managed runtime directories into PATH during validation, registration, and use.",
    "- SKILL.md with concise Pi-facing usage guidance and examples.",
    "- scripts/ wrappers for executable behavior; wrappers should keep stdout concise and write large/binary outputs as files.",
    "- focused deterministic tests and cheap health checks.",
    "- build metadata with version, provenance, package Git commit, installed ref, and last validated ref.",
    "",
    "Builder-managed lifecycle invariants:",
    "- Anything under .ambient/capability-builder/packages/ is Builder-managed source, not the installed Ambient CLI copy.",
    "- Editing Builder-managed source does not update the installed copy. After source edits or repairs, run preview if package shape changed, validate successfully, then register before testing the installed copy.",
    "- Treat failed validation as a hard stop: do not register, re-register, reinstall, or activate after a failed ambient_capability_builder_validate.",
    "- Avoid generic Ambient CLI package install/uninstall tools for Builder-managed packages unless the user explicitly asks for generic package operations.",
    "- For repairs, use ambient_capability_builder_repair_plan before nontrivial fixes and ambient_capability_builder_apply_repair for approved exact-file repairs when possible.",
    "",
    "Dependency and permission plan:",
    "- Inspect the current host environment first: OS, architecture, relevant runtime versions, package managers, accelerator/GPU assumptions, and credential requirements.",
    "- If a provider, URL, repo, model, binary, or library is named, read upstream README/install/example docs before choosing commands or package shape.",
    "- If the user has approved a known provider template/runtime path, that selected path is binding through scaffold, dependency install, repair, validation, and registration.",
    "- Do not switch runtimes, SDKs, model formats, package families, API vendors, or major install strategy merely because an upstream README, search result, or package page appears simpler; use those sources as implementation references for the approved path.",
    "- If the approved provider path is no longer viable, stop and present an explicit switch proposal before changing direction, including the approved path, proposed replacement path, failure reason, dependency/model/credential changes, validation impact, and rollback or cleanup impact.",
    "- Include platform-specific upstream guidance, preferred install/runtime path, required sample/model/assets, model/download behavior and expected size when known, license notes, and a clear local/API/not-viable compatibility decision.",
    "- List required package managers, binaries, network hosts, model/API providers, env variables, response formats, and any expected file artifact paths before installation.",
    "- Do not install dependencies or run setup commands until the user approves an exact command preview.",
    "- Secret values must never enter chat; declare env names and use Ambient secret/env binding flows.",
    "- Network/API capabilities must declare exact networkHosts or allowedNetworkHosts in the descriptor; do not hide outbound hosts in wrapper code or package-manager defaults.",
    "- Model-asset capabilities must list model files, source URLs, expected sizes when known, license/usage notes, cache path, and a small validation sample before any download.",
    "- Validation that needs a real API key or network call must be a tiny smoke request after env binding approval; offline health checks should not imply the live API path is validated.",
    "- Commands that accept user text must preserve exact text, including apostrophes, punctuation, quotes, whitespace where meaningful, and non-ASCII characters. Prefer --text-file, --ref-text-file, or equivalent file-input flags when CLI args risk changing the text.",
    "- Generated artifacts should be written to user-visible workspace paths when possible. Do not leave final user artifacts only inside .ambient/cli-packages/imported/ or package internals.",
    "",
    "Validation plan:",
    "- Preview descriptor and package shape before any install/register step.",
    "- Run health checks and one small mediated smoke test after scaffolding.",
    "- For search providers, default to concise JSON/text stdout; do not declare JSON/Markdown file artifacts unless validation will create or update those files.",
    "- For artifact generators, do not rely on import-only checks or static listings; run the primary wrapper on tiny input and verify it creates a real declared file artifact.",
    "- For artifact generators, verify the artifact exists and return a preview plus file reference rather than dumping large content in chat.",
    "- Register only after validation succeeds.",
    "",
    "Next step:",
    "Present this plan to the user. Wait for approval before scaffolding files, installing dependencies, registering the package, or activating anything.",
  ].filter(Boolean).join("\n");
}

function inferredProviderCatalogGuidance(input: AmbientCapabilityBuilderPlanInput): AmbientCapabilityBuilderProviderCatalogGuidance[] {
  if (input.installerShape === "tts-provider") {
    return mergeProviderCatalogGuidance(undefined, selectProviderCatalogCard(input, "voice-generation", "tts-provider")) ?? [];
  }
  if (input.installerShape === "search-provider") {
    return mergeProviderCatalogGuidance(undefined, selectProviderCatalogCard(input, "web-search", "search-provider")) ?? [];
  }
  if (input.installerShape === "custom-cli" && isRetrievalOrDeepResearchPlan(input)) {
    return mergeProviderCatalogGuidance(undefined, selectResearchProviderCatalogCard(input)) ?? [];
  }
  if (input.installerShape === "connector") {
    return mergeProviderCatalogGuidance(undefined, selectSensitiveConnectorProviderCatalogCard(input)) ?? [];
  }
  return [];
}

function formatProviderCatalogGuidanceForPlan(card: AmbientCapabilityBuilderProviderCatalogGuidance): string[] {
  const defaults = [
    card.defaults.provider ? `provider=${card.defaults.provider}` : undefined,
    card.defaults.locality ? `locality=${card.defaults.locality}` : undefined,
    card.defaults.outputFileArtifacts?.length ? `artifacts=${card.defaults.outputFileArtifacts.join(",")}` : undefined,
    card.defaults.responseFormats?.length ? `responses=${card.defaults.responseFormats.join(",")}` : undefined,
    card.defaults.envNames?.length ? `env=${card.defaults.envNames.join(",")}` : undefined,
    card.defaults.networkHosts?.length ? `hosts=${card.defaults.networkHosts.join(",")}` : undefined,
    card.defaults.modelAssets?.length ? `models=${card.defaults.modelAssets.join(",")}` : undefined,
  ].filter(Boolean).join("; ") || "none";
  const runtime = card.runtimeState
    ? [
      card.runtimeState.externalService ? "external service" : "no external service",
      card.runtimeState.serviceKind ? `kind=${card.runtimeState.serviceKind}` : undefined,
      card.runtimeState.statePaths?.length ? `state=${card.runtimeState.statePaths.join(",")}` : undefined,
      card.runtimeState.healthCheck ? `health=${card.runtimeState.healthCheck}` : undefined,
      card.runtimeState.updatePolicy ? `updates=${card.runtimeState.updatePolicy}` : undefined,
    ].filter(Boolean).join("; ")
    : "not specified";
  return [
    `- Selected known provider card: ${card.displayName} (${card.id}); area=${card.capabilityArea}; tier=${card.recommendationTier}; kind=${card.providerKind}; source=${card.sourceModel}.`,
    `- Catalog summary: ${card.recommendationSummary}`,
    `- Catalog defaults: ${defaults}`,
    `- Ambient contract: ${card.ambientContract.descriptorRequirements.join("; ")}; artifact policy: ${card.ambientContract.artifactPolicy}; validation: ${card.ambientContract.validationTarget}`,
    `- Secret flow: ${card.secrets.length ? card.secrets.map((secret) => `${secret.envName} via ${secret.capture}${secret.required ? " (required)" : " (optional)"}`).join("; ") : "none"}`,
    card.localArtifactReadiness
      ? `- Local artifacts: status=${card.localArtifactReadiness.status}; verified=${card.localArtifactReadiness.verifiedArtifacts.join(",") || "none"}; missing=${card.localArtifactReadiness.missingOrBlockingArtifacts.join(",") || "none"}; smoke=${card.localArtifactReadiness.minimumLocalSmokeTest ?? "not declared"}`
      : undefined,
    `- Runtime/state: ${runtime}`,
    card.selectionRules.length ? `- Provider selection rules: ${card.selectionRules.join("; ")}` : undefined,
    card.costPrivacyNotes.length ? `- Cost/privacy: ${card.costPrivacyNotes.join("; ")}` : undefined,
    card.maintenanceNotes.length ? `- Maintenance: ${card.maintenanceNotes.join("; ")}` : undefined,
    card.safetyBoundaries.length ? `- Safety boundaries: ${card.safetyBoundaries.join("; ")}` : undefined,
    card.knownQuirks.length ? `- Known quirks: ${card.knownQuirks.join("; ")}` : undefined,
  ].filter((line): line is string => Boolean(line));
}

export function suggestedCapabilityPackageName(goal: string, provider: string | undefined): string {
  const seed = `${provider ?? ""} ${goal}`.toLowerCase();
  const slug = seed
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48)
    .replace(/-+$/g, "");
  return slug ? `ambient-${slug}` : "ambient-generated-capability";
}
