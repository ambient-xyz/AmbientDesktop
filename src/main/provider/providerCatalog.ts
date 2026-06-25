import type { ProviderCatalogSettingsCard, ProviderCatalogSettingsState } from "../../shared/desktopTypes";
import { providerCatalogEntries } from "./providerCatalogEntries";
import type {
  ProviderCapabilityArea,
  ProviderCatalogEntry,
  ProviderInstallerShape,
  ProviderKind,
  ProviderLocalArtifactStatus,
  ProviderPlatformSupport,
  ProviderRecommendationTier,
  ProviderResearchStatus,
  ProviderSourceModel,
} from "./providerCatalogTypes";

export type {
  ProviderCapabilityArea,
  ProviderCatalogEntry,
  ProviderInstallerShape,
  ProviderInstallabilityStatus,
  ProviderKind,
  ProviderLocalArtifactStatus,
  ProviderPlatformSupport,
  ProviderPlatformSupportStatus,
  ProviderRecommendationTier,
  ProviderResearchStatus,
  ProviderSourceModel,
} from "./providerCatalogTypes";

export const providerCapabilityAreas = [
  "voice-generation",
  "voice-recognition",
  "web-search",
  "web-scraping",
  "retrieval",
  "deep-research",
  "visual-understanding",
  "image-generation",
  "video-generation",
  "rich-documents",
  "writing-style-transfer",
  "svg-animation",
  "social-media",
  "agentic-services",
  "chat-bridging",
] as const satisfies readonly ProviderCapabilityArea[];

export const providerInstallerShapes = [
  "tts-provider",
  "stt-provider",
  "search-provider",
  "browser-tooling",
  "artifact-generator",
  "vision-analysis-provider",
  "file-converter",
  "custom-cli",
  "connector",
  "network-integration",
] as const satisfies readonly ProviderInstallerShape[];

export const providerLocalityOptions = ["local", "cloud", "hybrid", "either"] as const;
export const providerSourcePreferenceOptions = ["open-source", "closed-source", "either"] as const;
export const providerPlatformOptions = ["macos-arm64", "macos-x64", "windows-x64", "linux-x64", "any"] as const;

export interface ProviderCatalogQuery {
  capabilityArea?: ProviderCapabilityArea;
  installerShape?: ProviderInstallerShape;
  goal?: string;
  locality?: "local" | "cloud" | "hybrid" | "either";
  sourcePreference?: "open-source" | "closed-source" | "either";
  platform?: "macos-arm64" | "macos-x64" | "windows-x64" | "linux-x64" | "any";
  includeExperimental?: boolean;
  includeNeedsResearch?: boolean;
  limit?: number;
}

export interface ProviderCatalogResult {
  catalogVersion: string;
  generatedAt: string;
  query: ProviderCatalogQuery;
  summary: string;
  recommendationPolicy: string[];
  providers: ProviderCatalogEntry[];
}

export interface ProviderSelectionGuidanceRule {
  id: string;
  label: string;
  guidance: string;
  appliesTo?: {
    capabilityAreas?: ProviderCapabilityArea[];
    installerShapes?: ProviderInstallerShape[];
    providerKinds?: ProviderKind[];
    sourceModels?: ProviderSourceModel[];
    recommendationTiers?: ProviderRecommendationTier[];
    localArtifactStatuses?: ProviderLocalArtifactStatus[];
    requiresSecrets?: boolean;
    hasModelAssets?: boolean;
    externalService?: boolean;
  };
}

export interface ProviderCatalogValidationResult {
  errors: string[];
  warnings: string[];
}

export interface ProviderCatalogToolExecutionResult {
  content: Array<{ type: "text"; text: string }>;
  details: {
    runtime: "ambient-provider-catalog";
    toolName: "ambient_provider_catalog";
    status: "complete";
    catalogVersion: string;
    generatedAt: string;
    query: ProviderCatalogQuery;
    providerCount: number;
    providers: ProviderCatalogEntry[];
    recommendationPolicy: string[];
  };
}

export const providerCatalogVersion = "2026-06-17.01";

export const providerRecommendationPolicy = [
  "Known provider cards describe potential providers, not currently installed providers.",
  "Use installed-provider status tools before claiming a provider is active.",
  "Use Ambient-managed secret capture for cloud/API credentials; never ask users to paste secrets into chat.",
  "Do not recommend local deep-research installation unless model weights, runnable code, tool protocol, setup instructions, and a smoke test are documented.",
  "For rich-document work, distinguish local file artifacts from cloud-native collaborative documents and conversion/extraction paths.",
  "For SVG/authored-motion work, distinguish standalone vector artifacts from app animation JSON and rendered video outputs.",
  "For image/video work, distinguish local model/workflow state, hosted API job state, deterministic authored motion, output artifact validation, and provider safety policy.",
  "For visual-understanding work, treat local multimodal models as evidence-gathering tools for Pi/GLM; validate input media boundaries, schema output, and uncertainty instead of replacing the primary reasoning model.",
  "For social media and agentic services, prefer read-only or draft-only flows first; externally visible or money-affecting actions require preview, explicit approval, account confirmation, and audit logging.",
  "Prefer typed Capability Builder installer shapes over generic package install flows.",
];

export const providerSelectionGuidanceRules: ProviderSelectionGuidanceRule[] = [
  {
    id: "local-vs-cloud",
    label: "Local vs cloud",
    guidance:
      "Prefer local/offline providers when privacy, offline use, repeatable cost, or a good-enough baseline matters; prefer cloud/API providers only when the user needs quality, latency, collaboration, or model capability that local cards do not evidence.",
  },
  {
    id: "ask-before-selecting",
    label: "Ask before selecting",
    guidance:
      "Ask a concise question when the catalog cannot choose between local vs cloud, open vs closed, draft/read-only vs write, sandbox vs live, or file artifact vs API response.",
  },
  {
    id: "visual-evidence",
    label: "Visual evidence",
    guidance:
      "Use visual-understanding providers to inspect bounded images, screenshots, and sampled video frames, then pass structured observations with confidence/limitations back to Pi; do not let the vision model mutate files or silently decide UI fixes.",
    appliesTo: { capabilityAreas: ["visual-understanding"] },
  },
  {
    id: "explicit-approval",
    label: "Explicit approval",
    guidance:
      "Require explicit approval before cost-incurring API use, uploads to provider services, public posting, account mutation, financial changes, or persistent external service state changes.",
    appliesTo: { providerKinds: ["cloud", "hybrid", "connector", "browser-mediated"] },
  },
  {
    id: "secret-boundary",
    label: "Secret boundary",
    guidance:
      "Declare env names and use Ambient-managed secret capture or env binding; never put secret values in chat, descriptors, logs, artifacts, or tool args.",
    appliesTo: { requiresSecrets: true },
  },
  {
    id: "approved-template-binding",
    label: "Approved template binding",
    guidance:
      "Once the user approves a known provider, template, or runtime path, keep that path binding through scaffold, dependency install, repair, validation, and registration; if upstream docs conflict, present an explicit switch proposal before changing provider or runtime.",
  },
  {
    id: "health-vs-validation",
    label: "Health vs validation",
    guidance:
      "Treat health checks, imports, descriptor previews, and package discovery as setup evidence only; real validation must run the primary tiny smoke path and verify stdout, artifacts, or provider results.",
  },
  {
    id: "local-baseline",
    label: "Good-enough local baseline",
    guidance:
      "Treat local baselines as reliability, privacy, and control paths; do not promise best quality or speed without side-by-side evidence against higher-quality hosted or heavier local options.",
    appliesTo: { providerKinds: ["local", "built-in"] },
  },
  {
    id: "runtime-state",
    label: "Runtime state",
    guidance:
      "For Docker, daemon, hosted-job, or sidecar providers, plan state paths, health checks, update cadence, ports/network policy, restart/cleanup, and stale-cache recovery explicitly.",
    appliesTo: { externalService: true },
  },
  {
    id: "model-assets",
    label: "Model assets",
    guidance:
      "For model-backed providers, document asset names, sources, expected size when known, license notes, cache paths, accelerator fit, and a small validation sample before any download.",
    appliesTo: { hasModelAssets: true },
  },
  {
    id: "research-evidence",
    label: "Research evidence",
    guidance:
      "Do not recommend retrieval or deep-research providers as install-ready unless weights, runnable code, tool protocol, setup instructions, and smoke-test evidence exist; separate search, scrape, retrieval, inference, synthesis, citations, and trace artifacts.",
    appliesTo: { capabilityAreas: ["retrieval", "deep-research"] },
  },
  {
    id: "sensitive-writes",
    label: "Sensitive writes",
    guidance:
      "Start read-only or draft-only; mutation requires exact preview, target account/object confirmation, idempotency or rollback notes, explicit approval, and audit identifiers.",
    appliesTo: { capabilityAreas: ["social-media", "agentic-services"] },
  },
];

export const providerCatalogBootstrapReminder = [
  "Ambient provider-selection reminder:",
  "- For web search provider access/add/install questions, call web_research_provider_search or web_research_provider_describe first.",
  "- For other provider choice/onboarding, route ambient_provider_catalog via ambient_tool_search, ambient_tool_describe, and ambient_tool_call first.",
  "- If a query returns no cards, broaden overly specific goal/provider filters before concluding none are known.",
  "- Catalog cards are read-only; use installed-provider status tools before claiming active/configured state.",
  "- After selecting, call ambient_capability_builder_plan before scaffolding, installs, secrets, registration, or APIs.",
  "- Keep catalog queries bounded; filter by capabilityArea, installerShape, provider, or goal.",
  "- Use Ambient-managed secret capture/env binding; never ask users to paste API keys, tokens, or passwords.",
].join("\n");

export { providerCatalogEntries };

export function getProviderCatalogEntries(): ProviderCatalogEntry[] {
  return providerCatalogEntries.map(cloneProviderCatalogEntry);
}

export function providerCatalogSettingsState(now = new Date()): ProviderCatalogSettingsState {
  const validation = validateProviderCatalog(providerCatalogEntries);
  if (validation.errors.length) throw new Error(`Provider catalog is invalid:\n${validation.errors.join("\n")}`);
  return {
    catalogVersion: providerCatalogVersion,
    generatedAt: now.toISOString(),
    cards: providerCatalogEntries.map(providerCatalogSettingsCard),
  };
}

function providerCatalogSettingsCard(entry: ProviderCatalogEntry): ProviderCatalogSettingsCard {
  return {
    id: entry.id,
    displayName: entry.displayName,
    capabilityArea: entry.capabilityArea,
    installerShape: entry.installerShape,
    providerKind: entry.providerKind,
    sourceModel: entry.sourceModel,
    recommendationTier: entry.recommendationTier,
    recommendationSummary: entry.recommendationSummary,
    installability: providerCatalogInstallability(entry),
    deploymentRole: entry.recommendationMemo?.deploymentRole,
    recommendation: entry.recommendationMemo?.recommendation,
    bestFor: [...entry.bestFor],
    tradeoffs: [...entry.tradeoffs],
    avoidWhen: [...entry.avoidWhen],
    platforms: [...entry.platforms],
    platformSupport: entry.platformSupport?.map((support) => ({
      ...support,
      evidence: [...support.evidence],
      caveats: [...support.caveats],
    })),
    hardwareFit: [...entry.hardwareFit],
    firstPartyTemplate: entry.firstPartyTemplate ? { ...entry.firstPartyTemplate } : undefined,
    capabilityBuilderDefaults: entry.capabilityBuilderDefaults
      ? {
          ...entry.capabilityBuilderDefaults,
          outputFileArtifacts: entry.capabilityBuilderDefaults.outputFileArtifacts
            ? [...entry.capabilityBuilderDefaults.outputFileArtifacts]
            : undefined,
          responseFormats: entry.capabilityBuilderDefaults.responseFormats
            ? [...entry.capabilityBuilderDefaults.responseFormats]
            : undefined,
          envNames: entry.capabilityBuilderDefaults.envNames ? [...entry.capabilityBuilderDefaults.envNames] : undefined,
          networkHosts: entry.capabilityBuilderDefaults.networkHosts ? [...entry.capabilityBuilderDefaults.networkHosts] : undefined,
          modelAssets: entry.capabilityBuilderDefaults.modelAssets ? [...entry.capabilityBuilderDefaults.modelAssets] : undefined,
        }
      : undefined,
    ambientContract: {
      ...entry.ambientContract,
      descriptorRequirements: [...entry.ambientContract.descriptorRequirements],
    },
    secrets: entry.secrets.map((secret) => ({ ...secret })),
    networkHosts: [...entry.networkHosts],
    modelAssets: entry.modelAssets.map(({ name, expectedSize, licenseNote, cachePolicy }) => ({
      name,
      expectedSize,
      licenseNote,
      cachePolicy,
    })),
    localArtifactStatus: entry.localArtifactReadiness?.status,
    minimumLocalSmokeTest: entry.localArtifactReadiness?.minimumLocalSmokeTest,
    runtimeState: entry.runtimeState
      ? {
          externalService: entry.runtimeState.externalService,
          serviceKind: entry.runtimeState.serviceKind,
          healthCheck: entry.runtimeState.healthCheck,
          updatePolicy: entry.runtimeState.updatePolicy,
        }
      : undefined,
    costPrivacyNotes: [...entry.costPrivacyNotes],
    maintenanceNotes: [...entry.maintenanceNotes],
    safetyBoundaries: [...entry.safetyBoundaries],
    knownQuirks: [...entry.knownQuirks],
    researchStatus: entry.researchStatus,
    docs: entry.docs.map((doc) => ({ ...doc })),
  };
}

function providerCatalogInstallability(entry: ProviderCatalogEntry): NonNullable<ProviderCatalogSettingsCard["installability"]> {
  return entry.installability
    ? { ...entry.installability }
    : {
        status: "installable",
        reason: "This provider catalog card can enter its typed setup flow after user approval.",
      };
}

export function queryProviderCatalog(query: ProviderCatalogQuery = {}, now = new Date()): ProviderCatalogResult {
  const validation = validateProviderCatalog(providerCatalogEntries);
  if (validation.errors.length) throw new Error(`Provider catalog is invalid:\n${validation.errors.join("\n")}`);

  const providers = providerCatalogEntries
    .filter((entry) => providerMatchesQuery(entry, query))
    .sort(compareProviderRecommendations)
    .slice(0, boundedLimit(query.limit))
    .map(cloneProviderCatalogEntry);

  const capability = query.capabilityArea ? ` for ${query.capabilityArea}` : "";
  return {
    catalogVersion: providerCatalogVersion,
    generatedAt: now.toISOString(),
    query: { ...query },
    summary: `${providers.length} known provider${providers.length === 1 ? "" : "s"} matched${capability}.`,
    recommendationPolicy: [...providerRecommendationPolicy],
    providers,
  };
}

export function providerSelectionGuidanceForProvider(provider: ProviderCatalogEntry): string[] {
  return providerSelectionGuidanceRules
    .filter((rule) => providerSelectionRuleApplies(rule, provider))
    .map((rule) => `${rule.label}: ${rule.guidance}`);
}

function providerSelectionRuleApplies(rule: ProviderSelectionGuidanceRule, provider: ProviderCatalogEntry): boolean {
  const appliesTo = rule.appliesTo;
  if (!appliesTo) return true;
  if (appliesTo.capabilityAreas && !appliesTo.capabilityAreas.includes(provider.capabilityArea)) return false;
  if (appliesTo.installerShapes && (!provider.installerShape || !appliesTo.installerShapes.includes(provider.installerShape))) return false;
  if (appliesTo.providerKinds && !appliesTo.providerKinds.includes(provider.providerKind)) return false;
  if (appliesTo.sourceModels && !appliesTo.sourceModels.includes(provider.sourceModel)) return false;
  if (appliesTo.recommendationTiers && !appliesTo.recommendationTiers.includes(provider.recommendationTier)) return false;
  if (appliesTo.localArtifactStatuses) {
    const status = provider.localArtifactReadiness?.status;
    if (!status || !appliesTo.localArtifactStatuses.includes(status)) return false;
  }
  if (appliesTo.requiresSecrets !== undefined && provider.secrets.length > 0 !== appliesTo.requiresSecrets) return false;
  if (appliesTo.hasModelAssets !== undefined && provider.modelAssets.length > 0 !== appliesTo.hasModelAssets) return false;
  if (appliesTo.externalService !== undefined && Boolean(provider.runtimeState?.externalService) !== appliesTo.externalService)
    return false;
  return true;
}

export function providerCatalogResultText(result: ProviderCatalogResult): string {
  const lines = [
    "Ambient provider catalog",
    `Version: ${result.catalogVersion}`,
    result.summary,
    "",
    "Policy:",
    ...result.recommendationPolicy.map((policy) => `- ${policy}`),
    "",
    "Providers:",
  ];

  if (!result.providers.length) {
    lines.push("- No known provider cards matched this query.");
    return lines.join("\n");
  }

  for (const provider of result.providers) {
    lines.push(
      `- ${provider.displayName} (${provider.id})`,
      `  area=${provider.capabilityArea}; installer=${provider.installerShape ?? "none"}; tier=${provider.recommendationTier}; kind=${provider.providerKind}; source=${provider.sourceModel}`,
      `  summary=${provider.recommendationSummary}`,
    );
    if (provider.installability) {
      lines.push(`  installability=${provider.installability.status}; reason=${provider.installability.reason}`);
    }
    if (provider.hardwareFit.length) {
      lines.push(`  hardware=${provider.hardwareFit.join("; ")}`);
    }
    if (provider.platformSupport?.length) {
      lines.push(`  platformSupport=${provider.platformSupport.map(formatPlatformSupportSummary).join("; ")}`);
    }
    const selectionGuidance = providerSelectionGuidanceForProvider(provider).slice(0, 4);
    if (selectionGuidance.length) {
      lines.push(`  selection=${selectionGuidance.join("; ")}`);
    }
    if (provider.recommendationMemo) {
      lines.push(
        `  memoRole=${provider.recommendationMemo.deploymentRole}; recommendation=${provider.recommendationMemo.recommendation}`,
        `  dogfood=${provider.recommendationMemo.dogfoodTargets.join("; ")}`,
        `  promoteWhen=${provider.recommendationMemo.promotionCriteria.join("; ")}`,
        `  fallback=${provider.recommendationMemo.fallbackGuidance.join("; ")}`,
      );
    }
    if (provider.localArtifactReadiness) {
      lines.push(
        `  localArtifacts=${provider.localArtifactReadiness.status}; smoke=${provider.localArtifactReadiness.minimumLocalSmokeTest ?? "not declared"}`,
      );
    }
    if (provider.secrets.length) {
      lines.push(
        `  secrets=${provider.secrets.map((secret) => `${secret.envName}${secret.required ? ":required" : ":optional"}`).join(", ")}`,
      );
    }
    if (provider.runtimeState?.externalService) {
      lines.push(
        `  runtime=${provider.runtimeState.serviceKind ?? "external"}${provider.runtimeState.updatePolicy ? `; updates=${provider.runtimeState.updatePolicy}` : ""}`,
      );
    }
    if (provider.ambientContract.descriptorRequirements.length) {
      lines.push(`  contract=${provider.ambientContract.descriptorRequirements.join("; ")}`);
    }
    lines.push(`  validation=${provider.ambientContract.validationTarget}`);
  }
  return lines.join("\n");
}

function formatPlatformSupportSummary(support: ProviderPlatformSupport): string {
  const caveat = support.caveats[0] ? `; caveat=${support.caveats[0]}` : "";
  return `${support.platform}:${support.status} runtime=${support.runtime}; install=${support.installMode}; evidence=${support.evidence.join(", ")}${caveat}`;
}

export function runProviderCatalogTool(input: unknown, now = new Date()): ProviderCatalogToolExecutionResult {
  const result = queryProviderCatalog(providerCatalogToolInput(input), now);
  return {
    content: [{ type: "text", text: providerCatalogResultText(result) }],
    details: {
      runtime: "ambient-provider-catalog",
      toolName: "ambient_provider_catalog",
      status: "complete",
      catalogVersion: result.catalogVersion,
      generatedAt: result.generatedAt,
      query: result.query,
      providerCount: result.providers.length,
      providers: result.providers,
      recommendationPolicy: result.recommendationPolicy,
    },
  };
}

export function validateProviderCatalog(
  entries: readonly ProviderCatalogEntry[] = providerCatalogEntries,
): ProviderCatalogValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const ids = new Set<string>();
  const ruleIds = new Set<string>();

  for (const rule of providerSelectionGuidanceRules) {
    if (ruleIds.has(rule.id)) errors.push(`Duplicate provider selection guidance rule id: ${rule.id}`);
    ruleIds.add(rule.id);
    if (!rule.label.trim()) errors.push(`${rule.id} provider selection guidance rule is missing label.`);
    if (!rule.guidance.trim()) errors.push(`${rule.id} provider selection guidance rule is missing guidance.`);
  }

  for (const entry of entries) {
    if (ids.has(entry.id)) errors.push(`Duplicate provider id: ${entry.id}`);
    ids.add(entry.id);
    if (!entry.displayName.trim()) errors.push(`${entry.id} is missing displayName.`);
    if (!entry.recommendationSummary.trim()) errors.push(`${entry.id} is missing recommendationSummary.`);
    if (!entry.ambientContract.descriptorRequirements.length) errors.push(`${entry.id} is missing descriptor requirements.`);
    if (!entry.ambientContract.validationTarget.trim()) errors.push(`${entry.id} is missing validation target.`);
    if (entry.installability) {
      if (!entry.installability.reason.trim()) errors.push(`${entry.id} installability reason is required.`);
      if (entry.installability.actionLabel !== undefined && !entry.installability.actionLabel.trim())
        errors.push(`${entry.id} installability actionLabel cannot be empty.`);
      if (entry.installability.actionTitle !== undefined && !entry.installability.actionTitle.trim())
        errors.push(`${entry.id} installability actionTitle cannot be empty.`);
    }
    if (providerCatalogTextMarksNonInstallable(entry) && entry.installability?.status !== "not-installable") {
      errors.push(`${entry.id} is described as non-installable but is not marked installability.status=not-installable.`);
    }
    if (entry.recommendationMemo) {
      if (!entry.recommendationMemo.recommendation.trim()) errors.push(`${entry.id} has an empty recommendation memo.`);
      if (!entry.recommendationMemo.dogfoodTargets.length) errors.push(`${entry.id} recommendation memo has no dogfood targets.`);
      if (!entry.recommendationMemo.promotionCriteria.length) errors.push(`${entry.id} recommendation memo has no promotion criteria.`);
      if (!entry.recommendationMemo.fallbackGuidance.length) errors.push(`${entry.id} recommendation memo has no fallback guidance.`);
    }
    if (
      [
        "voice-generation",
        "voice-recognition",
        "web-scraping",
        "web-search",
        "retrieval",
        "deep-research",
        "image-generation",
        "video-generation",
        "rich-documents",
        "svg-animation",
        "social-media",
        "agentic-services",
      ].includes(entry.capabilityArea) &&
      !entry.recommendationMemo
    ) {
      warnings.push(`${entry.id} is in the Phase 4 research sprint but has no recommendation memo.`);
    }
    if (entry.secrets.some((secret) => secret.envName.includes("=") || secret.envName.toLowerCase().includes("key-"))) {
      errors.push(`${entry.id} appears to contain a secret value instead of an env name.`);
    }
    if (entry.secrets.length && !entry.capabilityBuilderDefaults?.envNames?.length) {
      warnings.push(`${entry.id} declares secrets but no capabilityBuilderDefaults.envNames.`);
    }
    if (entry.capabilityArea === "deep-research" && !entry.localArtifactReadiness) {
      errors.push(`${entry.id} is a deep-research card without localArtifactReadiness.`);
    }
    if (entry.capabilityArea === "deep-research" && ["recommended", "default"].includes(entry.recommendationTier)) {
      const readiness = entry.localArtifactReadiness?.status;
      if (readiness !== "local-ready" && readiness !== "conditional-local") {
        errors.push(`${entry.id} cannot be ${entry.recommendationTier} with localArtifactReadiness=${readiness ?? "missing"}.`);
      }
    }
    if (entry.capabilityArea === "chat-bridging" && entry.recommendationTier !== "research-needed") {
      warnings.push(`${entry.id} is chat-bridging but not reserved as research-needed.`);
    }
    if (entry.platformSupport) {
      const supportedPlatforms = new Set(entry.platforms);
      const supportPlatforms = new Set<string>();
      for (const support of entry.platformSupport) {
        if (supportPlatforms.has(support.platform)) errors.push(`${entry.id} has duplicate platformSupport row for ${support.platform}.`);
        supportPlatforms.add(support.platform);
        if (!supportedPlatforms.has("any") && !supportedPlatforms.has(support.platform)) {
          errors.push(`${entry.id} platformSupport ${support.platform} is not declared in platforms.`);
        }
        if (!support.runtime.trim()) errors.push(`${entry.id} platformSupport ${support.platform} is missing runtime.`);
        if (!support.installMode.trim()) errors.push(`${entry.id} platformSupport ${support.platform} is missing installMode.`);
        if (!support.evidence.length) errors.push(`${entry.id} platformSupport ${support.platform} is missing evidence.`);
        if (support.status !== "supported" && !support.caveats.length)
          warnings.push(`${entry.id} platformSupport ${support.platform} has no caveats for ${support.status} status.`);
      }
    }
  }

  return { errors, warnings };
}

function providerCatalogTextMarksNonInstallable(entry: ProviderCatalogEntry): boolean {
  const text = [
    entry.recommendationSummary,
    ...entry.tradeoffs,
    ...entry.avoidWhen,
    entry.ambientContract.commandContract,
    ...entry.ambientContract.descriptorRequirements,
    entry.ambientContract.artifactPolicy,
    ...entry.safetyBoundaries,
  ]
    .filter(Boolean)
    .join("\n")
    .toLowerCase();

  return (
    /\bnon[- ]installable\b/.test(text) ||
    /\bnot installable\b/.test(text) ||
    /\bnot an? installable\b/.test(text) ||
    /\bnot an installed provider\b/.test(text) ||
    /\bno v1 installer claim\b/.test(text) ||
    /\bdo not surface as a v1 provider installer\b/.test(text)
  );
}

export function providerCatalogToolInput(input: unknown): ProviderCatalogQuery {
  const raw = input && typeof input === "object" && !Array.isArray(input) ? (input as Record<string, unknown>) : {};
  const capabilityArea = optionalEnum(raw.capabilityArea, "capabilityArea", providerCapabilityAreas);
  const installerShape = optionalEnum(raw.installerShape, "installerShape", providerInstallerShapes);
  const goal = optionalString(raw.goal);
  const locality = optionalEnum(raw.locality, "locality", providerLocalityOptions);
  const sourcePreference = optionalEnum(raw.sourcePreference, "sourcePreference", providerSourcePreferenceOptions);
  const platform = optionalEnum(raw.platform, "platform", providerPlatformOptions);
  const includeExperimental = optionalBoolean(raw.includeExperimental, "includeExperimental");
  const includeNeedsResearch = optionalBoolean(raw.includeNeedsResearch, "includeNeedsResearch");
  const limit = optionalLimit(raw.limit);

  return {
    ...(capabilityArea ? { capabilityArea } : {}),
    ...(installerShape ? { installerShape } : {}),
    ...(goal ? { goal } : {}),
    ...(locality ? { locality } : {}),
    ...(sourcePreference ? { sourcePreference } : {}),
    ...(platform ? { platform } : {}),
    ...(includeExperimental !== undefined ? { includeExperimental } : {}),
    ...(includeNeedsResearch !== undefined ? { includeNeedsResearch } : {}),
    ...(limit !== undefined ? { limit } : {}),
  };
}

function providerMatchesQuery(entry: ProviderCatalogEntry, query: ProviderCatalogQuery): boolean {
  if (query.capabilityArea && entry.capabilityArea !== query.capabilityArea) return false;
  if (query.installerShape && entry.installerShape !== query.installerShape) return false;
  if (!query.includeExperimental && entry.recommendationTier === "experimental") return false;
  if (!query.includeNeedsResearch && entry.recommendationTier === "research-needed") return false;
  if (query.locality && query.locality !== "either" && entry.providerKind !== query.locality) {
    if (!(query.locality === "local" && entry.providerKind === "built-in")) return false;
  }
  if (query.sourcePreference && query.sourcePreference !== "either" && entry.sourceModel !== query.sourcePreference) return false;
  if (query.platform && query.platform !== "any") {
    if (!entry.platforms.includes("any") && !entry.platforms.includes(query.platform)) return false;
    const support = entry.platformSupport?.find((candidate) => candidate.platform === query.platform);
    if (support?.status === "unsupported") return false;
    if (support?.status === "experimental" && !query.includeExperimental) return false;
  }
  if (query.goal?.trim() && !providerGoalMatches(entry, query.goal)) return false;
  return true;
}

function providerGoalMatches(entry: ProviderCatalogEntry, goalText: string): boolean {
  const goal = normalizeSearchText(goalText);
  const haystack = normalizeSearchText(providerGoalSearchText(entry));
  if (!goal) return true;
  if (providerIdentityMatchesGoal(entry, goalText)) return true;
  if (haystack.includes(goal)) return true;
  const tokens = significantGoalTokens(goalText);
  if (!tokens.length) return true;
  const matched = tokens.filter((token) => haystack.includes(token));
  if (tokens.length <= 3) return matched.length === tokens.length;
  return matched.length >= Math.min(3, tokens.length);
}

function providerIdentityMatchesGoal(entry: ProviderCatalogEntry, goalText: string): boolean {
  const goal = normalizeIdentifierSearchText(goalText);
  if (!goal) return false;
  const idSegments = entry.id.split(/[.:/_-]+/g);
  const identities = [entry.displayName, entry.capabilityBuilderDefaults?.provider, idSegments.at(-1)].filter((value): value is string =>
    Boolean(value?.trim()),
  );

  return identities.some((value) => {
    const identity = normalizeIdentifierSearchText(value);
    return identity.length >= 4 && goal.includes(identity);
  });
}

function providerGoalSearchText(entry: ProviderCatalogEntry): string {
  return [
    entry.id,
    entry.displayName,
    entry.capabilityArea,
    entry.installerShape,
    entry.providerKind,
    entry.sourceModel,
    entry.recommendationSummary,
    ...entry.bestFor,
    ...entry.tradeoffs,
    ...entry.avoidWhen,
    ...entry.hardwareFit,
    ...(entry.platformSupport ?? []).flatMap((support) => [
      support.platform,
      support.status,
      support.runtime,
      support.installMode,
      ...support.evidence,
      ...support.caveats,
    ]),
    ...entry.knownQuirks,
    ...(entry.recommendationMemo
      ? [entry.recommendationMemo.deploymentRole, entry.recommendationMemo.recommendation, ...entry.recommendationMemo.fallbackGuidance]
      : []),
    ...entry.modelAssets.map((asset) => [asset.name, asset.sourceUrl].filter(Boolean).join(" ")),
    ...(entry.capabilityBuilderDefaults?.modelAssets ?? []),
  ]
    .filter(Boolean)
    .join(" ");
}

function significantGoalTokens(value: string): string[] {
  const stopwords = new Set([
    "a",
    "an",
    "and",
    "are",
    "as",
    "be",
    "before",
    "by",
    "can",
    "choose",
    "for",
    "from",
    "has",
    "have",
    "how",
    "i",
    "in",
    "is",
    "it",
    "known",
    "knows",
    "me",
    "of",
    "on",
    "onboard",
    "or",
    "please",
    "provider",
    "providers",
    "recommend",
    "setup",
    "should",
    "start",
    "the",
    "to",
    "use",
    "using",
    "want",
    "we",
    "what",
    "whether",
    "which",
    "with",
  ]);
  return [
    ...new Set(
      value
        .toLowerCase()
        .split(/[^a-z0-9]+/g)
        .map((token) => token.trim())
        .filter((token) => token.length >= 2 && !stopwords.has(token)),
    ),
  ];
}

function compareProviderRecommendations(left: ProviderCatalogEntry, right: ProviderCatalogEntry): number {
  const tierDelta = recommendationTierRank(left.recommendationTier) - recommendationTierRank(right.recommendationTier);
  if (tierDelta !== 0) return tierDelta;
  const statusDelta = researchStatusRank(right.researchStatus) - researchStatusRank(left.researchStatus);
  if (statusDelta !== 0) return statusDelta;
  return left.displayName.localeCompare(right.displayName);
}

function recommendationTierRank(tier: ProviderRecommendationTier): number {
  switch (tier) {
    case "default":
      return 0;
    case "recommended":
      return 1;
    case "conditional":
      return 2;
    case "experimental":
      return 3;
    case "research-needed":
      return 4;
    case "not-recommended":
      return 5;
  }
}

function researchStatusRank(status: ProviderResearchStatus): number {
  switch (status) {
    case "live-dogfooded":
      return 4;
    case "credential-tested":
      return 3;
    case "researched":
      return 2;
    case "seeded":
      return 1;
    case "deprecated":
      return 0;
  }
}

function boundedLimit(limit: number | undefined): number {
  if (!Number.isFinite(limit)) return providerCatalogEntries.length;
  return Math.max(0, Math.min(Math.floor(limit ?? providerCatalogEntries.length), 50));
}

function cloneProviderCatalogEntry(entry: ProviderCatalogEntry): ProviderCatalogEntry {
  return {
    ...entry,
    installability: entry.installability ? { ...entry.installability } : undefined,
    bestFor: [...entry.bestFor],
    tradeoffs: [...entry.tradeoffs],
    avoidWhen: [...entry.avoidWhen],
    platforms: [...entry.platforms],
    platformSupport: entry.platformSupport?.map((support) => ({
      ...support,
      evidence: [...support.evidence],
      caveats: [...support.caveats],
    })),
    hardwareFit: [...entry.hardwareFit],
    firstPartyTemplate: entry.firstPartyTemplate ? { ...entry.firstPartyTemplate } : undefined,
    capabilityBuilderDefaults: entry.capabilityBuilderDefaults
      ? {
          ...entry.capabilityBuilderDefaults,
          outputFileArtifacts: entry.capabilityBuilderDefaults.outputFileArtifacts
            ? [...entry.capabilityBuilderDefaults.outputFileArtifacts]
            : undefined,
          responseFormats: entry.capabilityBuilderDefaults.responseFormats
            ? [...entry.capabilityBuilderDefaults.responseFormats]
            : undefined,
          envNames: entry.capabilityBuilderDefaults.envNames ? [...entry.capabilityBuilderDefaults.envNames] : undefined,
          networkHosts: entry.capabilityBuilderDefaults.networkHosts ? [...entry.capabilityBuilderDefaults.networkHosts] : undefined,
          modelAssets: entry.capabilityBuilderDefaults.modelAssets ? [...entry.capabilityBuilderDefaults.modelAssets] : undefined,
        }
      : undefined,
    ambientContract: {
      ...entry.ambientContract,
      descriptorRequirements: [...entry.ambientContract.descriptorRequirements],
    },
    secrets: entry.secrets.map((secret) => ({ ...secret })),
    networkHosts: [...entry.networkHosts],
    modelAssets: entry.modelAssets.map((asset) => ({ ...asset })),
    localArtifactReadiness: entry.localArtifactReadiness
      ? {
          ...entry.localArtifactReadiness,
          verifiedArtifacts: [...entry.localArtifactReadiness.verifiedArtifacts],
          missingOrBlockingArtifacts: [...entry.localArtifactReadiness.missingOrBlockingArtifacts],
        }
      : undefined,
    runtimeState: entry.runtimeState
      ? {
          ...entry.runtimeState,
          statePaths: entry.runtimeState.statePaths ? [...entry.runtimeState.statePaths] : undefined,
        }
      : undefined,
    costPrivacyNotes: [...entry.costPrivacyNotes],
    maintenanceNotes: [...entry.maintenanceNotes],
    safetyBoundaries: [...entry.safetyBoundaries],
    knownQuirks: [...entry.knownQuirks],
    evidence: entry.evidence.map((evidence) => ({ ...evidence })),
    docs: entry.docs.map((doc) => ({ ...doc })),
  };
}

function normalizeSearchText(value: string): string {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

function normalizeIdentifierSearchText(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function optionalBoolean(value: unknown, fieldName: string): boolean | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "boolean") throw new Error(`${fieldName} must be a boolean.`);
  return value;
}

function optionalLimit(value: unknown): number | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "number" || !Number.isFinite(value)) throw new Error("limit must be a finite number.");
  return Math.max(0, Math.min(Math.floor(value), 50));
}

function optionalEnum<T extends string>(value: unknown, fieldName: string, allowed: readonly T[]): T | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string") throw new Error(`${fieldName} must be a string.`);
  const trimmed = value.trim();
  if (!allowed.includes(trimmed as T)) {
    throw new Error(`${fieldName} must be one of: ${allowed.join(", ")}.`);
  }
  return trimmed as T;
}
