export type ProviderCapabilityArea =
  | "voice-generation"
  | "voice-recognition"
  | "web-search"
  | "web-scraping"
  | "retrieval"
  | "deep-research"
  | "visual-understanding"
  | "image-generation"
  | "video-generation"
  | "rich-documents"
  | "writing-style-transfer"
  | "svg-animation"
  | "social-media"
  | "agentic-services"
  | "chat-bridging";

export type ProviderInstallerShape =
  | "tts-provider"
  | "stt-provider"
  | "search-provider"
  | "browser-tooling"
  | "artifact-generator"
  | "vision-analysis-provider"
  | "file-converter"
  | "custom-cli"
  | "connector"
  | "network-integration";

export type ProviderKind = "local" | "cloud" | "hybrid" | "built-in" | "connector" | "browser-mediated";
export type ProviderSourceModel = "open-source" | "closed-source" | "mixed" | "ambient-built-in";
export type ProviderRecommendationTier = "default" | "recommended" | "conditional" | "experimental" | "research-needed" | "not-recommended";
export type ProviderInstallabilityStatus = "installable" | "not-installable";
export type ProviderResearchStatus = "seeded" | "researched" | "credential-tested" | "live-dogfooded" | "deprecated";
export type ProviderLocalArtifactStatus =
  | "local-ready"
  | "conditional-local"
  | "component-only"
  | "deployment-heavy"
  | "hosted-reference"
  | "research-reference"
  | "not-enough-artifacts";

export type ProviderPlatformSupportStatus = "supported" | "conditional" | "experimental" | "unsupported";

export interface ProviderPlatformSupport {
  platform: string;
  status: ProviderPlatformSupportStatus;
  runtime: string;
  installMode: string;
  evidence: string[];
  caveats: string[];
}

export interface ProviderCatalogEntry {
  id: string;
  displayName: string;
  capabilityArea: ProviderCapabilityArea;
  installerShape?: ProviderInstallerShape;
  providerKind: ProviderKind;
  sourceModel: ProviderSourceModel;
  recommendationTier: ProviderRecommendationTier;
  recommendationSummary: string;
  installability?: {
    status: ProviderInstallabilityStatus;
    reason: string;
    actionLabel?: string;
    actionTitle?: string;
  };
  recommendationMemo?: {
    deploymentRole: "primary" | "fallback" | "research" | "reserved";
    recommendation: string;
    dogfoodTargets: string[];
    promotionCriteria: string[];
    fallbackGuidance: string[];
  };
  bestFor: string[];
  tradeoffs: string[];
  avoidWhen: string[];
  platforms: string[];
  platformSupport?: ProviderPlatformSupport[];
  hardwareFit: string[];
  firstPartyTemplate?: {
    available: boolean;
    templateId?: string;
    notes?: string;
  };
  capabilityBuilderDefaults?: {
    provider?: string;
    locality?: "local" | "network" | "either";
    outputFileArtifacts?: string[];
    responseFormats?: string[];
    envNames?: string[];
    networkHosts?: string[];
    modelAssets?: string[];
  };
  ambientContract: {
    commandContract?: string;
    descriptorRequirements: string[];
    artifactPolicy: string;
    validationTarget: string;
  };
  secrets: Array<{
    envName: string;
    required: boolean;
    capture: "ambient_capability_builder_secret_request" | "ambient_cli_secret_request" | "ambient_cli_env_bind";
  }>;
  networkHosts: string[];
  modelAssets: Array<{
    name: string;
    sourceUrl?: string;
    expectedSize?: string;
    licenseNote?: string;
    cachePolicy?: string;
  }>;
  localArtifactReadiness?: {
    status: ProviderLocalArtifactStatus;
    verifiedArtifacts: string[];
    missingOrBlockingArtifacts: string[];
    minimumLocalSmokeTest?: string;
  };
  runtimeState?: {
    externalService: boolean;
    serviceKind?: "docker-compose" | "podman-compose" | "local-daemon" | "hosted-api" | "none";
    statePaths?: string[];
    healthCheck?: string;
    updatePolicy?: string;
  };
  costPrivacyNotes: string[];
  maintenanceNotes: string[];
  safetyBoundaries: string[];
  knownQuirks: string[];
  researchStatus: ProviderResearchStatus;
  evidence: Array<{
    date: string;
    type: "docs-review" | "local-smoke" | "credentialed-smoke" | "pi-live-dogfood" | "manual-note";
    summary: string;
    artifactPath?: string;
  }>;
  docs: Array<{
    label: string;
    url: string;
    lastReviewed?: string;
  }>;
}
