import type { ProviderCatalogSettingsCard, ProviderCatalogSettingsState } from "../shared/types";
import { miniCpmRemoteEndpointReviewChecklistText } from "../shared/miniCpmRemoteEndpointSecurity";
import { localDeepResearchModelProfilesManifest, localDeepResearchModelAssetNames } from "./localDeepResearchModelProfiles";

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

export const providerCatalogVersion = "2026-05-12.01";

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
    guidance: "Prefer local/offline providers when privacy, offline use, repeatable cost, or a good-enough baseline matters; prefer cloud/API providers only when the user needs quality, latency, collaboration, or model capability that local cards do not evidence.",
  },
  {
    id: "ask-before-selecting",
    label: "Ask before selecting",
    guidance: "Ask a concise question when the catalog cannot choose between local vs cloud, open vs closed, draft/read-only vs write, sandbox vs live, or file artifact vs API response.",
  },
  {
    id: "visual-evidence",
    label: "Visual evidence",
    guidance: "Use visual-understanding providers to inspect bounded images, screenshots, and sampled video frames, then pass structured observations with confidence/limitations back to Pi; do not let the vision model mutate files or silently decide UI fixes.",
    appliesTo: { capabilityAreas: ["visual-understanding"] },
  },
  {
    id: "explicit-approval",
    label: "Explicit approval",
    guidance: "Require explicit approval before cost-incurring API use, uploads to provider services, public posting, account mutation, financial changes, or persistent external service state changes.",
    appliesTo: { providerKinds: ["cloud", "hybrid", "connector", "browser-mediated"] },
  },
  {
    id: "secret-boundary",
    label: "Secret boundary",
    guidance: "Declare env names and use Ambient-managed secret capture or env binding; never put secret values in chat, descriptors, logs, artifacts, or tool args.",
    appliesTo: { requiresSecrets: true },
  },
  {
    id: "approved-template-binding",
    label: "Approved template binding",
    guidance: "Once the user approves a known provider, template, or runtime path, keep that path binding through scaffold, dependency install, repair, validation, and registration; if upstream docs conflict, present an explicit switch proposal before changing provider or runtime.",
  },
  {
    id: "health-vs-validation",
    label: "Health vs validation",
    guidance: "Treat health checks, imports, descriptor previews, and package discovery as setup evidence only; real validation must run the primary tiny smoke path and verify stdout, artifacts, or provider results.",
  },
  {
    id: "local-baseline",
    label: "Good-enough local baseline",
    guidance: "Treat local baselines as reliability, privacy, and control paths; do not promise best quality or speed without side-by-side evidence against higher-quality hosted or heavier local options.",
    appliesTo: { providerKinds: ["local", "built-in"] },
  },
  {
    id: "runtime-state",
    label: "Runtime state",
    guidance: "For Docker, daemon, hosted-job, or sidecar providers, plan state paths, health checks, update cadence, ports/network policy, restart/cleanup, and stale-cache recovery explicitly.",
    appliesTo: { externalService: true },
  },
  {
    id: "model-assets",
    label: "Model assets",
    guidance: "For model-backed providers, document asset names, sources, expected size when known, license notes, cache paths, accelerator fit, and a small validation sample before any download.",
    appliesTo: { hasModelAssets: true },
  },
  {
    id: "research-evidence",
    label: "Research evidence",
    guidance: "Do not recommend retrieval or deep-research providers as install-ready unless weights, runnable code, tool protocol, setup instructions, and smoke-test evidence exist; separate search, scrape, retrieval, inference, synthesis, citations, and trace artifacts.",
    appliesTo: { capabilityAreas: ["retrieval", "deep-research"] },
  },
  {
    id: "sensitive-writes",
    label: "Sensitive writes",
    guidance: "Start read-only or draft-only; mutation requires exact preview, target account/object confirmation, idempotency or rollback notes, explicit approval, and audit identifiers.",
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

const reviewedAt = "2026-05-11";

export const providerCatalogEntries: ProviderCatalogEntry[] = [
  {
    id: "voice.piper",
    displayName: "Piper",
    capabilityArea: "voice-generation",
    installerShape: "tts-provider",
    providerKind: "local",
    sourceModel: "open-source",
    recommendationTier: "recommended",
    recommendationSummary: "Reliable local/offline TTS baseline for quick Ambient voice-provider onboarding.",
    recommendationMemo: {
      deploymentRole: "primary",
      recommendation: "Use Piper as the default local/offline TTS provider when the user wants reliable voice output, no cloud upload, and the fastest path to a working Ambient voice-provider contract.",
      dogfoodTargets: [
        "Run the existing generated Piper Capability Builder lifecycle dogfood through plan, scaffold, dependency install, validation, registration, unregister, re-register, and Ambient CLI describe/run.",
        "Generate a tiny WAV through the registered voice-provider command and verify the file is non-empty, user-visible, and reported with artifact metadata.",
        "Record exact Piper binary/package version, selected voice model URL/SHA/size, config path, voice id, sample rate, and warm-run latency.",
      ],
      promotionCriteria: [
        "The first-party or generated Piper tts-provider template validates and registers without hidden global dependencies.",
        "At least one bundled or fetched voice model produces deterministic WAV output on macOS arm64 and Linux x64.",
        "Pi guidance states that Piper is the reliability/privacy baseline, not the most expressive hosted voice option.",
      ],
      fallbackGuidance: [
        "Use Kokoro ONNX when the user wants a higher-quality local experiment and accepts model/dependency validation.",
        "Use ElevenLabs when premium hosted voice quality matters more than local privacy/cost.",
        "Use Cartesia when low-latency hosted conversational voice is the primary requirement.",
      ],
    },
    bestFor: ["Offline TTS", "Low-cost validation", "Privacy-sensitive voice output"],
    tradeoffs: ["Less expressive than premium hosted voices", "Voice model quality varies by asset"],
    avoidWhen: ["The user needs studio-quality or low-latency conversational cloud voices"],
    platforms: ["macos-arm64", "macos-x64", "windows-x64", "linux-x64"],
    hardwareFit: ["CPU-friendly for short utterances"],
    firstPartyTemplate: { available: true, templateId: "tts-provider:piper", notes: "Use local TTS installer shape." },
    capabilityBuilderDefaults: {
      provider: "Piper",
      locality: "local",
      outputFileArtifacts: ["wav"],
      modelAssets: ["Piper voice model", "Piper config"],
    },
    ambientContract: {
      commandContract: "TTS command writes a declared WAV artifact and descriptor declares voiceProvider metadata.",
      descriptorRequirements: ["installerShape tts-provider", "voiceProvider command metadata", "audio artifact output"],
      artifactPolicy: "Write audio artifacts to user-visible workspace paths during validation.",
      validationTarget: "Generate a tiny WAV from fixed text through the voice provider contract.",
    },
    secrets: [],
    networkHosts: [],
    modelAssets: [{ name: "Piper voice model", licenseNote: "Review selected voice asset license.", cachePolicy: "Workspace or provider cache." }],
    runtimeState: { externalService: false, serviceKind: "none" },
    costPrivacyNotes: ["No cloud upload required after model assets are present."],
    maintenanceNotes: ["Pin model assets, voice config, piper package/binary version, sample rate, and supported output format in the provider card."],
    safetyBoundaries: ["Do not imply voice cloning support unless a provider declares it separately."],
    knownQuirks: ["Voice quality depends heavily on the selected model.", "Asset-backed validation succeeds only after the ONNX voice model and JSON config are placed under the provider-local models directory; missing assets fail fast with a clear setup error."],
    researchStatus: "live-dogfooded",
    evidence: [
      { date: reviewedAt, type: "manual-note", summary: "Seeded from existing Ambient TTS onboarding plan." },
      { date: reviewedAt, type: "pi-live-dogfood", summary: "Existing live Capability Builder dogfood covers Piper planning, scaffolding, dependency install, validation, registration, re-registration, Ambient CLI describe/run, and WAV artifact generation." },
      { date: reviewedAt, type: "local-smoke", summary: "Phase 5 live Pi dogfood copied cached en_US-lessac-medium Piper model/config files into the provider-local models directory through approval-gated Builder install_deps, validated and registered the local tts-provider, selected it for voice output, and generated real WAV artifacts through both provider-contract validation and a fresh installed ambient_cli run." },
    ],
    docs: [
      { label: "Piper repository", url: "https://github.com/rhasspy/piper", lastReviewed: reviewedAt },
      { label: "Piper voice assets", url: "https://huggingface.co/rhasspy/piper-voices", lastReviewed: reviewedAt },
      { label: "Provider onboarding plan", url: "providerOnboarding.md", lastReviewed: reviewedAt },
    ],
  },
  {
    id: "voice.kokoro-onnx",
    displayName: "Kokoro ONNX",
    capabilityArea: "voice-generation",
    installerShape: "tts-provider",
    providerKind: "local",
    sourceModel: "open-source",
    recommendationTier: "conditional",
    recommendationSummary: "Higher-quality local TTS candidate for Apple Silicon and local/offline voice experiments once model assets are validated.",
    recommendationMemo: {
      deploymentRole: "fallback",
      recommendation: "Use Kokoro ONNX as the local quality fallback when Piper is too robotic and the user accepts model asset downloads, ONNX runtime setup, and stricter platform validation.",
      dogfoodTargets: [
        "Scaffold the first-party Kokoro ONNX tts-provider template and preview model/dependency downloads before install.",
        "Validate missing-asset behavior first, then download kokoro-v1.0.int8.onnx and voices-v1.0.bin into the provider-local models directory.",
        "Generate a tiny WAV with a fixed voice id and record model SHA/size, voices asset revision, Python/ONNX package versions, language/voice id, text chunk length, and latency.",
      ],
      promotionCriteria: [
        "Model and voices assets are pinned with reviewed release terms and reproducible cache paths.",
        "Validation succeeds on macOS arm64 and one Linux target without privileged dependency surprises.",
        "Pi guidance keeps Kokoro ONNX distinct from heavier Kokoro/MLX variants unless the user explicitly approves a different runtime path.",
      ],
      fallbackGuidance: [
        "Use Piper when the user wants the safest local baseline or fastest offline setup.",
        "Use ElevenLabs or Cartesia when local quality is not good enough and the user accepts cloud voice generation.",
      ],
    },
    bestFor: ["Local TTS quality experiments", "Apple Silicon voice output", "Offline voice provider research"],
    tradeoffs: ["More dependency/model asset risk than Piper", "Asset provenance and runtime compatibility need validation", "Keep text chunks short; observed Kokoro ONNX runs can fail around the upstream 510-phoneme boundary."],
    avoidWhen: ["The user wants the fastest reliable local TTS baseline"],
    platforms: ["macos-arm64", "linux-x64"],
    hardwareFit: ["Best on Apple Silicon or a local machine with a tuned Python/ONNX runtime"],
    firstPartyTemplate: { available: true, templateId: "tts-provider:kokoro-onnx", notes: "Use the dogfooded ONNX path before considering heavier Kokoro/MLX variants." },
    capabilityBuilderDefaults: {
      provider: "Kokoro ONNX",
      locality: "local",
      outputFileArtifacts: ["wav"],
      networkHosts: ["github.com"],
      modelAssets: ["kokoro-v1.0.int8.onnx", "voices-v1.0.bin"],
    },
    ambientContract: {
      commandContract: "TTS command writes a declared WAV artifact and descriptor declares local voiceProvider metadata.",
      descriptorRequirements: ["installerShape tts-provider", "voiceProvider command metadata", "audio artifact output", "model asset declarations"],
      artifactPolicy: "Write audio artifacts to user-visible workspace paths during validation.",
      validationTarget: "Generate a tiny WAV from fixed text through the Kokoro ONNX voice provider contract.",
    },
    secrets: [],
    networkHosts: ["github.com"],
    modelAssets: [
      { name: "kokoro-v1.0.int8.onnx", licenseNote: "Review selected model asset release terms.", cachePolicy: "Provider-local models directory." },
      { name: "voices-v1.0.bin", licenseNote: "Review selected voice asset release terms.", cachePolicy: "Provider-local models directory." },
    ],
    runtimeState: { externalService: false, serviceKind: "none" },
    costPrivacyNotes: ["No cloud upload required after model assets are present."],
    maintenanceNotes: ["Pin model assets, voices asset, runtime package, phonemizer/espeak-ng expectations, language/voice id, supported platform, and max synthesis chunk length before promotion."],
    safetyBoundaries: ["Do not switch to another Kokoro runtime path without explicit user approval."],
    knownQuirks: ["ONNX runtime and model asset locations are the main setup risks.", "Long text can trip the Kokoro ONNX phoneme limit; use short validation text and chunk assistant replies to roughly 1,000 characters or less until the provider wrapper enforces a safer limit."],
    researchStatus: "researched",
    evidence: [
      { date: reviewedAt, type: "manual-note", summary: "Seeded from existing Ambient Kokoro ONNX TTS template." },
      { date: reviewedAt, type: "local-smoke", summary: "Unit coverage verifies Kokoro ONNX scaffold shape, model asset declarations, and clear missing-asset validation failure." },
    ],
    docs: [
      { label: "Kokoro ONNX repository", url: "https://github.com/thewh1teagle/kokoro-onnx", lastReviewed: reviewedAt },
      { label: "Kokoro ONNX model release", url: "https://github.com/thewh1teagle/kokoro-onnx/releases/tag/model-files-v1.0", lastReviewed: reviewedAt },
      { label: "Provider onboarding plan", url: "providerOnboarding.md", lastReviewed: reviewedAt },
    ],
  },
  {
    id: "voice.elevenlabs",
    displayName: "ElevenLabs",
    capabilityArea: "voice-generation",
    installerShape: "tts-provider",
    providerKind: "cloud",
    sourceModel: "closed-source",
    recommendationTier: "conditional",
    recommendationSummary: "High-quality hosted TTS candidate when the user accepts cost, network upload, and provider account requirements.",
    recommendationMemo: {
      deploymentRole: "fallback",
      recommendation: "Use ElevenLabs as the premium hosted voice-quality path when the user accepts cloud text upload, API cost/quota, and Ambient-managed secret capture.",
      dogfoodTargets: [
        "Run the approved ElevenLabs cloud TTS full-flow dogfood: plan, scaffold, Desktop secret request, Builder-scoped secret save, validate, register, unregister, re-register, and rollback audio generation.",
        "Generate one tiny MP3 through the registered provider command and verify the transcript/audit never contains ELEVENLABS_API_KEY or the secret value.",
        "Record selected model id, voice id, output format, audio size, provider latency/error shape, and quota/rate-limit behavior.",
      ],
      promotionCriteria: [
        "The first-party ElevenLabs tts-provider template validates and registers after Ambient-managed secret capture.",
        "Live audio generation succeeds with a non-empty artifact and no secret leakage in transcript, audit, tool output, or artifacts.",
        "Pi guidance states cost/privacy boundaries and voice-cloning consent separation before recommending hosted voice generation.",
      ],
      fallbackGuidance: [
        "Use Piper when local privacy/offline behavior is more important than expressiveness.",
        "Use Cartesia when low-latency conversational output is more important than ElevenLabs voice style.",
        "Use xAI/Grok TTS only after a separate credentialed dogfood proves the newer API path in Ambient.",
      ],
    },
    bestFor: ["Expressive hosted voices", "Fast path to polished voice output"],
    tradeoffs: ["Requires API key", "Cloud cost and privacy disclosure required"],
    avoidWhen: ["The user requires fully local/offline voice generation"],
    platforms: ["any"],
    hardwareFit: ["No local model runtime needed"],
    firstPartyTemplate: { available: true, templateId: "tts-provider:elevenlabs" },
    capabilityBuilderDefaults: {
      provider: "ElevenLabs",
      locality: "network",
      outputFileArtifacts: ["mp3"],
      envNames: ["ELEVENLABS_API_KEY"],
      networkHosts: ["api.elevenlabs.io"],
    },
    ambientContract: {
      commandContract: "TTS command writes a declared MP3/WAV artifact and reports provider errors without leaking secrets.",
      descriptorRequirements: ["installerShape tts-provider", "required env declaration", "voiceProvider command metadata"],
      artifactPolicy: "Write generated audio as a workspace artifact; do not log secret values.",
      validationTarget: "Generate a tiny audio artifact after Ambient-managed secret capture.",
    },
    secrets: [{ envName: "ELEVENLABS_API_KEY", required: true, capture: "ambient_capability_builder_secret_request" }],
    networkHosts: ["api.elevenlabs.io"],
    modelAssets: [],
    runtimeState: { externalService: true, serviceKind: "hosted-api" },
    costPrivacyNotes: ["User text is sent to ElevenLabs; disclose pricing/quota and retention uncertainty before use."],
    maintenanceNotes: ["Review current API model ids, voice ids, output formats, quota/rate-limit behavior, and provider retention policy before marking recommended."],
    safetyBoundaries: ["Voice cloning requires separate consent and provider-specific guardrails."],
    knownQuirks: ["Dynamic voice ids and quotas can vary by account."],
    researchStatus: "live-dogfooded",
    evidence: [
      { date: reviewedAt, type: "docs-review", summary: "Cloud TTS candidate seeded for credentialed dogfood." },
      { date: reviewedAt, type: "pi-live-dogfood", summary: "Existing live cloud TTS dogfood covers ElevenLabs planning, scaffolding, secret request/save, validation, registration, voice-provider selection, rollback registration, and real audio artifact generation when the dogfood secret is available." },
      { date: reviewedAt, type: "credentialed-smoke", summary: "Phase 5 live Pi dogfood reran the approved ElevenLabs cloud TTS full-flow using ELEVENLABS_API_KEY from an approved ignored secret file, requested and saved the Builder-scoped Desktop secret, validated and registered the provider, selected it for voice output, generated a real MP3 rollback artifact, and verified the key was absent from transcript, audit, registration, and command output." },
    ],
    docs: [
      { label: "ElevenLabs Text to Speech API", url: "https://elevenlabs.io/docs/api-reference/text-to-speech/convert", lastReviewed: reviewedAt },
      { label: "ElevenLabs docs", url: "https://elevenlabs.io/docs", lastReviewed: reviewedAt },
    ],
  },
  {
    id: "voice.cartesia",
    displayName: "Cartesia",
    capabilityArea: "voice-generation",
    installerShape: "tts-provider",
    providerKind: "cloud",
    sourceModel: "closed-source",
    recommendationTier: "conditional",
    recommendationSummary: "Low-latency hosted TTS candidate when the user accepts API credentials, cloud upload, cost, and provider terms.",
    recommendationMemo: {
      deploymentRole: "fallback",
      recommendation: "Use Cartesia as the hosted low-latency voice path when responsiveness matters and the user accepts cloud text upload, API cost/quota, and Ambient-managed secret capture.",
      dogfoodTargets: [
        "Run the approved Cartesia cloud TTS full-flow dogfood: plan, scaffold, Desktop secret request, Builder-scoped secret save, validate, register, unregister, re-register, and rollback audio generation.",
        "Generate one tiny WAV through the registered provider command and verify CARTESIA_API_KEY never appears in transcript, audit, tool output, or artifacts.",
        "Record selected Sonic model id, voice id, output format, latency/time-to-first-byte if exposed, provider error shape, and API-version header.",
      ],
      promotionCriteria: [
        "The first-party Cartesia tts-provider template validates and registers after Ambient-managed secret capture.",
        "Live audio generation succeeds with a non-empty WAV artifact and no secret leakage.",
        "Pi guidance states latency/cost/privacy tradeoffs and tracks Cartesia API version/model-id changes before recommendation.",
      ],
      fallbackGuidance: [
        "Use Piper when local privacy/offline behavior is more important than low latency.",
        "Use ElevenLabs when premium hosted voice style is more important than the Cartesia latency path.",
        "Use xAI/Grok TTS only after its Ambient wrapper is credential-tested.",
      ],
    },
    bestFor: ["Hosted low-latency voice output", "Polished chat voicing", "Cloud voice provider comparison"],
    tradeoffs: ["Requires API key", "Cloud cost and privacy disclosure required"],
    avoidWhen: ["The user requires fully local/offline voice generation"],
    platforms: ["any"],
    hardwareFit: ["No local model runtime needed"],
    firstPartyTemplate: { available: true, templateId: "tts-provider:cartesia" },
    capabilityBuilderDefaults: {
      provider: "Cartesia",
      locality: "network",
      outputFileArtifacts: ["wav"],
      envNames: ["CARTESIA_API_KEY"],
      networkHosts: ["api.cartesia.ai"],
    },
    ambientContract: {
      commandContract: "TTS command writes a declared WAV artifact and reports provider errors without leaking secrets.",
      descriptorRequirements: ["installerShape tts-provider", "required env declaration", "voiceProvider command metadata"],
      artifactPolicy: "Write generated audio as a workspace artifact; do not log secret values.",
      validationTarget: "Generate a tiny WAV artifact after Ambient-managed secret capture.",
    },
    secrets: [{ envName: "CARTESIA_API_KEY", required: true, capture: "ambient_capability_builder_secret_request" }],
    networkHosts: ["api.cartesia.ai"],
    modelAssets: [],
    runtimeState: { externalService: true, serviceKind: "hosted-api" },
    costPrivacyNotes: ["User text is sent to Cartesia; disclose pricing/quota and retention uncertainty before use."],
    maintenanceNotes: ["Review current API version, Sonic model ids, voice ids, output formats, latency claims, and migration deadlines before marking recommended."],
    safetyBoundaries: ["Voice cloning requires separate consent and provider-specific guardrails."],
    knownQuirks: ["API version and voice ids can change independently of the Ambient scaffold."],
    researchStatus: "live-dogfooded",
    evidence: [
      { date: reviewedAt, type: "docs-review", summary: "Cloud TTS candidate seeded from existing Ambient Cartesia template." },
      { date: reviewedAt, type: "pi-live-dogfood", summary: "Existing live cloud TTS dogfood covers Cartesia planning, scaffolding, secret request/save, validation, registration, voice-provider selection, rollback registration, and real audio artifact generation when the dogfood secret is available." },
      { date: reviewedAt, type: "credentialed-smoke", summary: "Phase 5 live Pi dogfood reran the approved Cartesia cloud TTS full-flow using CARTESIA_API_KEY from an approved ignored secret file, requested and saved the Builder-scoped Desktop secret, validated and registered the provider, selected it for voice output, generated a real WAV rollback artifact, and verified the key was absent from transcript, audit, registration, and command output." },
    ],
    docs: [
      { label: "Cartesia Text to Speech API", url: "https://docs.cartesia.ai/api-reference/tts/bytes", lastReviewed: reviewedAt },
      { label: "Cartesia docs", url: "https://docs.cartesia.ai", lastReviewed: reviewedAt },
    ],
  },
  {
    id: "voice.xai-grok-tts",
    displayName: "xAI Grok TTS",
    capabilityArea: "voice-generation",
    installerShape: "tts-provider",
    providerKind: "cloud",
    sourceModel: "closed-source",
    recommendationTier: "research-needed",
    recommendationSummary: "Documented xAI voice API candidate that needs credentialed Ambient dogfood before recommendation.",
    recommendationMemo: {
      deploymentRole: "research",
      recommendation: "Keep xAI Grok TTS as a research candidate: xAI now documents a TTS API, output formats, voices, speech tags, and streaming support, but Ambient should not recommend it until a credentialed wrapper is dogfooded end-to-end.",
      dogfoodTargets: [
        "Build a minimal xAI TTS wrapper using XAI_API_KEY from Ambient-managed secret capture and api.x.ai as the only declared network host.",
        "Generate one short MP3 and one WAV or PCM sample through the Ambient voice-provider contract, including streaming only after the batch path works.",
        "Record model id, voice id, format, speech-tag behavior, latency, error codes, and whether output MIME metadata matches the generated artifact.",
      ],
      promotionCriteria: [
        "Credentialed Ambient dogfood succeeds without exposing XAI_API_KEY in chat, args, logs, descriptors, artifacts, or audit output.",
        "The wrapper handles documented voices and formats while returning bounded errors for unsupported tags, voices, or streaming failures.",
        "Cost/privacy and provider terms are reviewed, and xAI-specific guidance is compared against ElevenLabs/Cartesia before recommendation.",
      ],
      fallbackGuidance: [
        "Use ElevenLabs for the current hosted premium-quality path.",
        "Use Cartesia for the current hosted low-latency path.",
        "Use Piper or Kokoro ONNX when local/offline voice generation is required.",
      ],
    },
    bestFor: ["Exploring xAI voice coverage", "Hosted speech generation research"],
    tradeoffs: ["New provider path", "Requires current docs and API-key validation"],
    avoidWhen: ["The user needs a proven Ambient voice provider today"],
    platforms: ["any"],
    hardwareFit: ["No local model runtime needed"],
    capabilityBuilderDefaults: {
      provider: "xAI Grok TTS",
      locality: "network",
      outputFileArtifacts: ["mp3", "wav"],
      envNames: ["XAI_API_KEY"],
      networkHosts: ["api.x.ai"],
    },
    ambientContract: {
      commandContract: "Cloud TTS wrapper writes a declared audio artifact and keeps XAI_API_KEY out of args/logs.",
      descriptorRequirements: ["installerShape tts-provider", "required env declaration", "voiceProvider command metadata"],
      artifactPolicy: "Write generated audio to a workspace artifact with MIME metadata.",
      validationTarget: "Generate one short phrase through Ambient-managed secret capture.",
    },
    secrets: [{ envName: "XAI_API_KEY", required: true, capture: "ambient_capability_builder_secret_request" }],
    networkHosts: ["api.x.ai"],
    modelAssets: [],
    runtimeState: { externalService: true, serviceKind: "hosted-api" },
    costPrivacyNotes: ["Cloud request sends text to xAI and may incur API cost."],
    maintenanceNotes: ["Re-review API formats, voice list, speech tags, streaming support, model ids, and pricing before promotion."],
    safetyBoundaries: ["Do not ask users to paste XAI_API_KEY into chat."],
    knownQuirks: ["Ambient has not dogfooded this provider path yet.", "The xAI path should not displace ElevenLabs or Cartesia until it has equivalent secret, artifact, and voice-provider lifecycle coverage."],
    researchStatus: "researched",
    evidence: [{ date: reviewedAt, type: "docs-review", summary: "xAI documents voice/TTS APIs, but Ambient has not credential-tested them." }],
    docs: [
      { label: "xAI voice docs", url: "https://docs.x.ai/developers/model-capabilities/audio/voice", lastReviewed: reviewedAt },
      { label: "xAI Text to Speech API", url: "https://docs.x.ai/developers/model-capabilities/audio/text-to-speech", lastReviewed: reviewedAt },
    ],
  },
  {
    id: "stt.qwen-asr",
    displayName: "Qwen ASR",
    capabilityArea: "voice-recognition",
    installerShape: "stt-provider",
    providerKind: "local",
    sourceModel: "open-source",
    recommendationTier: "recommended",
    recommendationSummary: "Primary local/open ASR path for Ambient voice recognition where the first-party Qwen3-ASR runtime fits the host.",
    recommendationMemo: {
      deploymentRole: "primary",
      recommendation: "Use Qwen ASR as the favored first-party local STT path for Ambient push-to-talk and core app voice recognition, but validate through the Ambient STT provider path rather than direct CLI-only runs.",
      dogfoodTargets: [
        "Install or select ambient-qwen3-asr, then transcribe the small known WAV through ambient_stt provider testing.",
        "Run the qwen validation harness on the target host and record model asset id, runtime binding, language, latency/RTF, and silence-gate behavior.",
        "Compare at least one multilingual or accented sample against faster-whisper before claiming broad-language quality.",
      ],
      promotionCriteria: [
        "Bundled asset manifest size/SHA validation succeeds for the selected Qwen model.",
        "Ambient STT provider test passes on the target OS/architecture with transcript metadata preserved.",
        "Known multilingual, language-prompting, and no-speech quirks are captured in the card before user-facing recommendation.",
      ],
      fallbackGuidance: [
        "Use faster-whisper when Qwen assets, llama.cpp binding, or accelerator support are unavailable.",
        "Use faster-whisper when multilingual quality is more important than keeping the Qwen-family path.",
      ],
    },
    bestFor: ["Local ASR", "Qwen-family model alignment", "Privacy-sensitive transcription"],
    tradeoffs: ["Model assets and runtime can be heavy", "Streaming behavior needs continued validation", "Internal STT spike data showed multilingual quality can lag faster-whisper on a small corpus"],
    avoidWhen: ["The user needs the smallest possible CPU-only install"],
    platforms: ["macos-arm64", "linux-x64", "windows-x64"],
    hardwareFit: ["Best with GPU/accelerator or tuned local runtime"],
    firstPartyTemplate: { available: true, templateId: "stt-provider:qwen-asr" },
    capabilityBuilderDefaults: {
      provider: "Qwen ASR",
      locality: "local",
      responseFormats: ["json", "text"],
      modelAssets: ["Qwen ASR model assets"],
    },
    ambientContract: {
      commandContract: "STT command accepts an audio file and returns transcript text plus structured metadata.",
      descriptorRequirements: ["installerShape stt-provider", "audio input declaration", "transcript response format"],
      artifactPolicy: "Preserve input audio path and transcript metadata without copying secrets.",
      validationTarget: "Transcribe a small known WAV through Ambient STT.",
    },
    secrets: [],
    networkHosts: [],
    modelAssets: [{ name: "Qwen ASR model assets", cachePolicy: "Ambient CLI package or model cache." }],
    runtimeState: { externalService: false, serviceKind: "none" },
    costPrivacyNotes: ["Local transcription avoids cloud upload when assets are local."],
    maintenanceNotes: ["Track runtime compatibility, model cache size, asset manifest revision, and language-prompting guidance per platform."],
    safetyBoundaries: ["Do not record microphone input without explicit user action."],
    knownQuirks: ["Streaming and chunking behavior needs platform-specific evidence.", "For some multilingual samples, explicit language prompting and no-speech pre-gating are important product boundaries.", "Ambient STT status can discover the bundled provider before runtime/model assets are ready; Pi must treat `available=false` plus `validation=needs-runtime` as a setup blocker, not a selectable provider."],
    researchStatus: "live-dogfooded",
    evidence: [
      { date: reviewedAt, type: "manual-note", summary: "Favored ASR path per current provider plan." },
      { date: reviewedAt, type: "local-smoke", summary: "Bundled ambient-qwen3-asr package, validation harness, asset manifest checks, and live Linux GPU transcription evidence exist in the STT implementation plan." },
      { date: reviewedAt, type: "local-smoke", summary: "Phase 5 live Pi dogfood installed the bundled ambient-qwen3-asr package with runtime autodetect/download disabled, persisted `needs-runtime` validation metadata for a missing llama-mtmd-cli path, and verified `ambient_stt_status` surfaced Qwen3-ASR as unavailable with the pinned qwen3-asr-0.6b-q8_0 asset revision instead of selecting or testing it." },
    ],
    docs: [
      { label: "Qwen3-ASR model card", url: "https://huggingface.co/Qwen/Qwen3-ASR-1.7B", lastReviewed: reviewedAt },
      { label: "Qwen ASR package assets", url: "resources/ambient-cli-packages/ambient-qwen3-asr/assets/qwen3-asr-assets.json", lastReviewed: reviewedAt },
      { label: "STT spike plan", url: "STTSpikePlan.md", lastReviewed: reviewedAt },
      { label: "STT implementation plan", url: "sttImplementationPlan.md", lastReviewed: reviewedAt },
    ],
  },
  {
    id: "stt.faster-whisper",
    displayName: "faster-whisper",
    capabilityArea: "voice-recognition",
    installerShape: "stt-provider",
    providerKind: "local",
    sourceModel: "open-source",
    recommendationTier: "conditional",
    recommendationSummary: "Pragmatic local Whisper-family fallback for users who want a proven ASR ecosystem.",
    recommendationMemo: {
      deploymentRole: "fallback",
      recommendation: "Keep faster-whisper as the local control baseline and fallback when Qwen ASR is unsupported, unavailable, or lower quality for the user's language/audio profile.",
      dogfoodTargets: [
        "Run the bundled ambient-faster-whisper-stt package through ambient_stt_status, ambient_stt_select, and ambient_stt_test against the same fixed STT corpus used for Qwen validation.",
        "Record model size, compute type, CPU/GPU backend, warm-run latency/RTF, and transcript quality.",
        "Check the bundled package health output for the adapter-only install contract before interpreting availability as model/runtime readiness.",
        "Run the clean-cache validation script when changing the wrapper, uv/Python pin, or cache guidance so first-run behavior is measured with isolated uv/Hugging Face/XDG caches.",
        "Keep the bundled package on the tiny.en control path until larger macOS CPU/Metal-equivalent, Windows, and multilingual variants have comparable evidence.",
      ],
      promotionCriteria: [
        "Deterministic wrapper emits transcript text plus timing metadata without truncating long outputs.",
        "Install/runtime path is reproducible without hidden global Python state.",
        "Ambient STT status/select/test path passes through a real Pi dogfood turn with approval-gated selection and provider testing.",
        "Quality or compatibility advantage over Qwen is documented for the selected scenario.",
      ],
      fallbackGuidance: [
        "Prefer Qwen ASR when the user wants the Ambient-favored first-party local STT path and the host passes validation.",
        "Use cloud STT research candidates only after a separate privacy/cost decision.",
      ],
    },
    bestFor: ["Local ASR fallback", "Whisper-compatible workflows", "Deterministic smoke tests"],
    tradeoffs: ["Model size/performance tradeoffs", "Less favored than Qwen ASR for current Ambient direction"],
    avoidWhen: ["The user specifically wants Qwen ASR behavior"],
    platforms: ["macos-arm64", "macos-x64", "windows-x64", "linux-x64"],
    hardwareFit: ["CPU works for small models; Linux CUDA RTX 4090 clean-cache smoke passed for tiny.en float16; GPU improves throughput"],
    capabilityBuilderDefaults: {
      provider: "faster-whisper",
      locality: "local",
      responseFormats: ["json", "text"],
      modelAssets: ["Whisper model"],
    },
    ambientContract: {
      commandContract: "STT command accepts an audio file and emits transcript text plus timing metadata when available.",
      descriptorRequirements: ["installerShape stt-provider", "audio input declaration", "transcript response format"],
      artifactPolicy: "Do not discard full transcript metadata when Pi only receives a preview.",
      validationTarget: "Transcribe a small known WAV and compare against expected text.",
    },
    secrets: [],
    networkHosts: [],
    modelAssets: [{ name: "Whisper model", licenseNote: "Review selected model license.", cachePolicy: "Local model cache." }],
    runtimeState: { externalService: false, serviceKind: "none" },
    costPrivacyNotes: ["Local runtime avoids hosted transcription cost."],
    maintenanceNotes: ["Pin faster-whisper version, model size, CTranslate2 backend, and Python/runtime isolation in the card."],
    safetyBoundaries: ["Do not auto-record user audio."],
    knownQuirks: [
      "Apple Silicon and CUDA installs can differ substantially.",
      "The uv path needs cache access outside strict workspace sandboxes, and faster-whisper==1.1.1 needed an explicit requests dependency in live macOS uv smoke.",
      "The tiny.en CPU smoke is setup/control evidence only, not multilingual quality evidence.",
      "The bundled product-path package is intentionally English-only tiny.en until a larger multilingual model is selected and dogfooded.",
      "The bundled product-path package is adapter-only: it does not include uv, Python, faster-whisper wheels, CTranslate2 binaries, or model weights.",
      "First transcription may download uv, Python wheel, and model assets into local caches; warm-run latency is the comparable number.",
      "Clean-cache validation isolates UV_CACHE_DIR, UV_PYTHON_INSTALL_DIR, HF_HOME, HF_HUB_CACHE, and XDG_CACHE_HOME so first-run cache behavior is visible without changing the package into a bundled runtime.",
      "Linux CUDA clean-cache validation resolved a substantially larger uv/runtime cache than macOS CPU because GPU wheels and CUDA-related runtime dependencies were included.",
    ],
    researchStatus: "live-dogfooded",
    evidence: [
      { date: reviewedAt, type: "manual-note", summary: "Fallback local ASR candidate seeded for comparison." },
      { date: reviewedAt, type: "local-smoke", summary: "Internal STT spike includes faster-whisper large-v3-turbo as a multilingual quality and speed baseline." },
      { date: reviewedAt, type: "local-smoke", summary: "Phase 5 local STT smoke ran scripts/stt-spike/providers.faster-whisper-tiny-smoke.json on macOS arm64 with uv, faster-whisper==1.1.1 plus explicit requests, tiny.en, CPU int8, and the public English HF ASR dummy WAV; the harness succeeded with language=en, language match yes, RTF 0.093 on a warm/cache run, and preserved summary/results/transcript artifacts under .ambient/stt-spike/runs/mac-faster-whisper-tiny-en-20260511/2026-05-11T16-48-08-821Z." },
      { date: reviewedAt, type: "pi-live-dogfood", summary: "Phase 5 live Ambient/Pi product-path dogfood installed the bundled ambient-faster-whisper-stt package in a temp workspace, prepared the public English HF ASR dummy WAV, and had Pi call ambient_stt_status, approval-gated ambient_stt_select, and approval-gated ambient_stt_test; the real local faster-whisper tiny.en provider returned the expected transcript phrase `He hoped there would be stew` and the test recorded allowed selection/test permission audits." },
      { date: reviewedAt, type: "local-smoke", summary: "Phase 5 adapter-contract hardening made the bundled package report adapter-only distribution and uv-based install plan details in health output, with tests covering fake mode and missing-uv guidance so Pi can distinguish package presence from runtime/model asset readiness." },
      { date: reviewedAt, type: "local-smoke", summary: "Phase 5 clean-cache validation added scripts/stt-faster-whisper-clean-cache-validation.mjs and ran it on macOS arm64 with isolated uv/Python/Hugging Face/XDG caches; the real tiny.en CPU path resolved about 895 MB of runtime/model cache state, reported packageType=adapter-only and bundled asset flags false, and transcribed the public English HF ASR dummy WAV with the expected stew phrase in about 21.7s provider elapsed time." },
      { date: reviewedAt, type: "local-smoke", summary: "Phase 5 Linux clean-cache validation ran the same script over SSH on drone, an Ubuntu x64 host with an NVIDIA RTX 4090, using AMBIENT_FASTER_WHISPER_UV=/home/ambient/.local/bin/uv, device=cuda, compute=float16; the adapter stayed packageType=adapter-only with all bundled asset flags false, resolved about 2.66 GB into isolated uv/Hugging Face/XDG caches, and transcribed the public English HF ASR dummy WAV with language=en and the expected stew phrase in about 7.4s provider elapsed time." },
    ],
    docs: [
      { label: "faster-whisper", url: "https://github.com/SYSTRAN/faster-whisper", lastReviewed: reviewedAt },
      { label: "Ambient faster-whisper STT package", url: "resources/ambient-cli-packages/ambient-faster-whisper-stt", lastReviewed: reviewedAt },
      { label: "Ambient faster-whisper STT package instructions", url: "resources/ambient-cli-packages/ambient-faster-whisper-stt/SKILL.md", lastReviewed: reviewedAt },
      { label: "faster-whisper clean-cache validation", url: "scripts/stt-faster-whisper-clean-cache-validation.mjs", lastReviewed: reviewedAt },
      { label: "faster-whisper tiny smoke provider config", url: "scripts/stt-spike/providers.faster-whisper-tiny-smoke.json", lastReviewed: reviewedAt },
      { label: "faster-whisper STT live product-path dogfood", url: "src/main/pluginDogfood.test.ts", lastReviewed: reviewedAt },
      { label: "STT spike plan", url: "STTSpikePlan.md", lastReviewed: reviewedAt },
    ],
  },
  {
    id: "search.brave",
    displayName: "Brave Search API",
    capabilityArea: "web-search",
    installerShape: "search-provider",
    providerKind: "cloud",
    sourceModel: "closed-source",
    recommendationTier: "recommended",
    recommendationSummary: "Strong initial API-backed web search provider for Ambient CLI search routing.",
    recommendationMemo: {
      deploymentRole: "primary",
      recommendation: "Use Brave Search as the first API-backed web search provider for Ambient because it has a direct JSON API, an existing first-party template, a narrow secret shape, and prior live Capability Builder dogfood.",
      dogfoodTargets: [
        "Run the existing Brave Search Capability Builder lifecycle dogfood with BRAVE_API_KEY bound through Ambient-managed secret flow.",
        "Run one tiny query through the registered Ambient CLI/provider wrapper and verify bounded JSON result previews plus host metadata.",
        "Record quota/rate-limit errors distinctly from empty-result or malformed-response failures.",
      ],
      promotionCriteria: [
        "First-party search-provider template validates without Pi seeing the secret value.",
        "A live query succeeds against api.search.brave.com with result title, URL, snippet, and provider metadata preserved.",
        "Pi guidance distinguishes search snippets from fetched page content and routes extraction to scraping/browser tools.",
      ],
      fallbackGuidance: [
        "Use Google Programmable Search only for existing Google Custom Search JSON API customers with valid quota and engine id.",
        "Use browser-mediated Google Search when the user explicitly wants visible Google results and accepts browser interaction boundaries.",
        "Use SearXNG when self-hosting/metasearch control is more important than minimal setup.",
      ],
    },
    bestFor: ["Web search API setup", "Predictable JSON search results", "Search routing dogfood"],
    tradeoffs: ["Requires API key", "External search provider cost/quota applies"],
    avoidWhen: ["The user requires local/self-hosted search only"],
    platforms: ["any"],
    hardwareFit: ["No local model runtime needed"],
    firstPartyTemplate: { available: true, templateId: "search-provider:brave" },
    capabilityBuilderDefaults: {
      provider: "Brave Search",
      locality: "network",
      responseFormats: ["json"],
      envNames: ["BRAVE_API_KEY"],
      networkHosts: ["api.search.brave.com"],
    },
    ambientContract: {
      commandContract: "Search command returns bounded JSON/text results and preserves full output as needed.",
      descriptorRequirements: ["installerShape search-provider", "required env declaration", "response format declaration"],
      artifactPolicy: "No user file artifact required for a tiny search smoke test.",
      validationTarget: "Run one tiny query through Ambient CLI/provider wrappers.",
    },
    secrets: [{ envName: "BRAVE_API_KEY", required: true, capture: "ambient_capability_builder_secret_request" }],
    networkHosts: ["api.search.brave.com"],
    modelAssets: [],
    runtimeState: { externalService: true, serviceKind: "hosted-api" },
    costPrivacyNotes: ["Queries are sent to Brave Search and may count against quota."],
    maintenanceNotes: ["Track API response shape, LLM Context endpoint fit, pricing/quota changes, and rate-limit errors."],
    safetyBoundaries: ["Respect configured search routing preferences and user instructions."],
    knownQuirks: ["Search snippets are not page content; scraping/extraction remains separate."],
    researchStatus: "live-dogfooded",
    evidence: [
      { date: reviewedAt, type: "manual-note", summary: "Seeded from existing Ambient search preference work." },
      { date: reviewedAt, type: "pi-live-dogfood", summary: "Existing Capability Builder live dogfood installs, binds secrets, registers, and runs real Brave Search API queries through Ambient CLI." },
      { date: reviewedAt, type: "credentialed-smoke", summary: "Phase 5 live Pi dogfood reran Brave Search with BRAVE_API_KEY from an approved ignored secret file, installed the package, bound the file secret, requested the Desktop secret flow, saved the secret, ran two real searches, and verified the key was absent from transcript and audit output." },
    ],
    docs: [{ label: "Brave Search API", url: "https://api-dashboard.search.brave.com/app/documentation/web-search/get-started", lastReviewed: reviewedAt }],
  },
  {
    id: "search.google-browser",
    displayName: "Google Search (browser)",
    capabilityArea: "web-search",
    installerShape: "browser-tooling",
    providerKind: "browser-mediated",
    sourceModel: "closed-source",
    recommendationTier: "conditional",
    recommendationSummary: "Straight consumer Google Search through approved browser automation, not an installable API provider.",
    installability: {
      status: "not-installable",
      reason: "Google Search (browser) uses existing approved browser/web research tooling and must not be scaffolded, registered, or claimed as an installed provider.",
      actionLabel: "Review",
      actionTitle: "Review browser-mediated Google Search guidance.",
    },
    recommendationMemo: {
      deploymentRole: "fallback",
      recommendation: "Use browser-mediated Google Search only as a visible, user-intent-driven fallback when API-backed search coverage is insufficient or the user specifically asks for Google results.",
      dogfoodTargets: [
        "Run one visible browser search for a tiny query and capture result URL/title snippets without claiming installed-provider status.",
        "Exercise consent, localization, and no-result/CAPTCHA branches in a manual browser smoke before relying on it for research flows.",
        "Verify follow-up page extraction is handled by browser/scraping tools rather than by parsing Google results as canonical content.",
      ],
      promotionCriteria: [
        "Browser flow is explicit and visible, with no hidden background scraping claim.",
        "Result extraction returns bounded titles/URLs/snippets and records consent/CAPTCHA failures as browser-state issues.",
        "Pi guidance consistently chooses API search first unless the user requests visible Google Search.",
      ],
      fallbackGuidance: [
        "Use Brave Search for default API-backed web search.",
        "Use Google Programmable Search for existing Custom Search JSON API customers when a configured engine id is available.",
        "Use SearXNG when the user wants a self-hosted aggregator and accepts service maintenance.",
      ],
    },
    bestFor: ["User-visible Google Search", "Fallback web research", "Cases where API search coverage is unsuitable"],
    tradeoffs: ["Not an installed provider", "Requires browser visibility and interaction boundaries", "Results page structure can change"],
    avoidWhen: ["The user wants an API-backed search provider or hidden background search routing"],
    platforms: ["any"],
    hardwareFit: ["Uses the existing browser path rather than a local model runtime"],
    capabilityBuilderDefaults: {
      provider: "Google Search (browser)",
      locality: "network",
      responseFormats: ["text"],
      networkHosts: ["www.google.com"],
    },
    ambientContract: {
      commandContract: "Use browser-mediated search tools with visible navigation and bounded extraction rather than a generated search-provider package.",
      descriptorRequirements: ["Use approved browser tooling", "Do not claim installed-provider status"],
      artifactPolicy: "Return bounded snippets and URLs; use scraping/extraction tools separately for page content.",
      validationTarget: "Run a visible browser search for one tiny query and inspect result navigation behavior.",
    },
    secrets: [],
    networkHosts: ["www.google.com"],
    modelAssets: [],
    runtimeState: { externalService: true, serviceKind: "hosted-api" },
    costPrivacyNotes: ["Queries are sent to Google through the user's browser context."],
    maintenanceNotes: ["Treat as fallback because HTML, consent, localization, and anti-abuse behavior can change."],
    safetyBoundaries: ["Do not scrape Google HTML as an installed provider path unless the user explicitly approves browser-mediated search."],
    knownQuirks: ["May hit consent pages, CAPTCHAs, personalization, or regional result differences."],
    researchStatus: "researched",
    evidence: [{ date: reviewedAt, type: "manual-note", summary: "Seeded as the straight Google Search fallback requested for the catalog." }],
    docs: [{ label: "Google Search", url: "https://www.google.com/search?q=ambient", lastReviewed: reviewedAt }],
  },
  {
    id: "search.google-programmable",
    displayName: "Google Programmable Search",
    capabilityArea: "web-search",
    installerShape: "search-provider",
    providerKind: "cloud",
    sourceModel: "closed-source",
    recommendationTier: "conditional",
    recommendationSummary: "Legacy Google-backed API candidate for existing Custom Search JSON API customers with a configured engine id.",
    recommendationMemo: {
      deploymentRole: "reserved",
      recommendation: "Do not make Google Programmable Search the default new-user path: Google's Custom Search JSON API is closed to new customers and existing customers must transition by January 1, 2027. Keep it as a reserved path for users who already have valid API access and a search engine id.",
      dogfoodTargets: [
        "Validate a known existing GOOGLE_SEARCH_API_KEY and GOOGLE_SEARCH_ENGINE_ID through Ambient-managed secret binding.",
        "Run one tiny query against customsearch.googleapis.com and record whether the failure is access-disabled, quota, engine configuration, or empty result.",
        "Compare result coverage against Brave Search for the same query before recommending it for a workflow.",
      ],
      promotionCriteria: [
        "User confirms they are an existing Custom Search JSON API customer with valid quota.",
        "Ambient wrapper returns JSON items with title, link, snippet, and explicit engine id provenance without exposing secrets.",
        "Plan text states the January 1, 2027 transition deadline and avoids presenting this as a new-user setup path.",
      ],
      fallbackGuidance: [
        "Use Brave Search for new API-backed search setup.",
        "Use browser-mediated Google Search when the user wants visible consumer Google behavior.",
        "Use Vertex AI Search only as a separate enterprise/site-domain research track, not as the V1 full-web default.",
      ],
    },
    bestFor: ["Existing Google Custom Search JSON API customers", "Google-backed search", "API-mediated result retrieval"],
    tradeoffs: ["Requires API key and search engine id", "Quota and Custom Search configuration complexity", "Closed to new customers with existing-customer transition deadline"],
    avoidWhen: ["The user expects unrestricted consumer Google Search behavior", "The user does not already have Custom Search JSON API access"],
    platforms: ["any"],
    hardwareFit: ["No local model runtime needed"],
    capabilityBuilderDefaults: {
      provider: "Google Programmable Search",
      locality: "network",
      responseFormats: ["json"],
      envNames: ["GOOGLE_SEARCH_API_KEY", "GOOGLE_SEARCH_ENGINE_ID"],
      networkHosts: ["customsearch.googleapis.com"],
    },
    ambientContract: {
      commandContract: "Search command returns structured results without leaking API key or engine id.",
      descriptorRequirements: ["installerShape search-provider", "required env declarations", "response format declaration"],
      artifactPolicy: "No file artifact required for tiny search smoke test.",
      validationTarget: "Run one tiny query after Ambient-managed secret binding.",
    },
    secrets: [
      { envName: "GOOGLE_SEARCH_API_KEY", required: true, capture: "ambient_capability_builder_secret_request" },
      { envName: "GOOGLE_SEARCH_ENGINE_ID", required: true, capture: "ambient_capability_builder_secret_request" },
    ],
    networkHosts: ["customsearch.googleapis.com"],
    modelAssets: [],
    runtimeState: { externalService: true, serviceKind: "hosted-api" },
    costPrivacyNotes: ["Queries go to Google API and may use paid quota; the API is only available to existing customers until discontinuation."],
    maintenanceNotes: ["Document Custom Search engine setup separately from API key setup, and track the January 1, 2027 transition deadline."],
    safetyBoundaries: ["Do not scrape Google HTML when an API path was configured unless the user explicitly asks."],
    knownQuirks: ["Coverage depends on Programmable Search configuration.", "Google docs state the Custom Search JSON API is closed to new customers and existing customers must transition by January 1, 2027."],
    researchStatus: "researched",
    evidence: [{ date: reviewedAt, type: "docs-review", summary: "Google Custom Search JSON API reviewed as direct Google search option." }],
    docs: [{ label: "Custom Search JSON API", url: "https://developers.google.com/custom-search/v1/overview", lastReviewed: reviewedAt }],
  },
  {
    id: "search.searxng",
    displayName: "SearXNG",
    capabilityArea: "web-search",
    installerShape: "search-provider",
    providerKind: "hybrid",
    sourceModel: "open-source",
    recommendationTier: "conditional",
    recommendationSummary: "Self-hosted metasearch option with useful privacy properties but meaningful container and update overhead.",
    recommendationMemo: {
      deploymentRole: "fallback",
      recommendation: "Use SearXNG as the self-hosted/metasearch path only when the user accepts a managed Docker/Podman service, persistent config/state, health checks, and regular updates for upstream-engine breakage.",
      dogfoodTargets: [
        "Start the SearXNG compose stack in a provider-owned directory and record container names, ports, config path, and Valkey/limiter state.",
        "Run one local JSON query and inspect logs for engine failures, blocked engines, or CAPTCHA messages.",
        "Exercise update flow separately: refresh compose templates or pull images, then re-run health and query smoke tests.",
      ],
      promotionCriteria: [
        "Lifecycle commands can start, stop, status-check, update, and log-inspect the service without losing settings.yml state.",
        "Health check plus a tiny query succeeds against localhost with JSON enabled and bounded result output.",
        "Pi guidance explicitly states that Google and other upstream engines can block SearXNG and require regular updates/config tuning.",
      ],
      fallbackGuidance: [
        "Use Brave Search when the user wants minimal-maintenance API-backed search.",
        "Use browser-mediated Google Search for visible one-off Google result checks.",
        "Use scraping/browser providers after search result selection when page content, not snippets, is required.",
      ],
    },
    bestFor: ["Self-hosted search", "Metasearch experimentation", "Users willing to manage Docker/Podman state"],
    tradeoffs: ["Separate service/container state", "Google and other engines may block or CAPTCHA", "Regular updates required"],
    avoidWhen: ["The user wants zero-maintenance search setup"],
    platforms: ["macos-arm64", "macos-x64", "linux-x64"],
    hardwareFit: ["Light service, but requires container runtime and network egress"],
    capabilityBuilderDefaults: {
      provider: "SearXNG",
      locality: "network",
      responseFormats: ["json", "html"],
      networkHosts: ["localhost"],
    },
    ambientContract: {
      commandContract: "Search command queries the local SearXNG endpoint and returns bounded structured results.",
      descriptorRequirements: ["installerShape search-provider", "health check declaration", "response format declaration"],
      artifactPolicy: "Keep full logs/state out of Pi context unless requested; provide paths.",
      validationTarget: "Start service, run a tiny query, inspect health/logs, then stop or record managed state.",
    },
    secrets: [],
    networkHosts: ["localhost"],
    modelAssets: [],
    runtimeState: {
      externalService: true,
      serviceKind: "docker-compose",
      statePaths: ["searxng/settings.yml", "searxng/limiter.toml", "valkey/"],
      healthCheck: "GET /healthz or a tiny JSON search query against the local instance.",
      updatePolicy: "Regularly update the container because upstream engines, especially Google, change blocking behavior.",
    },
    costPrivacyNotes: ["Queries leave the local machine through upstream engines even though the aggregator is local."],
    maintenanceNotes: ["Manage container lifecycle, config, Valkey/limiter state, logs, and updates explicitly."],
    safetyBoundaries: ["Do not imply SearXNG bypasses site terms or anti-abuse systems."],
    knownQuirks: ["Google results can degrade due to CAPTCHA/blocking; engine reliability changes over time."],
    researchStatus: "researched",
    evidence: [{ date: reviewedAt, type: "docs-review", summary: "Docker install, settings, and maintenance caveats reviewed." }],
    docs: [
      { label: "SearXNG Docker installation", url: "https://docs.searxng.org/admin/installation-docker", lastReviewed: reviewedAt },
      { label: "SearXNG maintenance script", url: "https://docs.searxng.org/utils/searxng.sh.html", lastReviewed: reviewedAt },
      { label: "SearXNG settings", url: "https://docs.searxng.org/admin/settings/settings", lastReviewed: reviewedAt },
    ],
  },
  {
    id: "scrape.scrapling",
    displayName: "Scrapling",
    capabilityArea: "web-scraping",
    installerShape: "browser-tooling",
    providerKind: "local",
    sourceModel: "open-source",
    recommendationTier: "recommended",
    recommendationSummary: "Recommended first local scraping/extraction library path for static HTML and structured extraction before heavier browser automation.",
    recommendationMemo: {
      deploymentRole: "primary",
      recommendation: "Use Scrapling as the first recommended generated scraping capability when the target is public/static or can be fetched within approved boundaries; keep authenticated or highly dynamic browsing on Ambient browser tools.",
      dogfoodTargets: [
        "Run the existing real Scrapling Capability Builder lifecycle dogfood and preserve validation logs.",
        "Extract structured content from a controlled HTML fixture and one public page, saving full output artifacts when large.",
        "Validate static extraction separately from any Playwright/Chrome-backed dynamic-fetch mode.",
      ],
      promotionCriteria: [
        "Real Scrapling dependency warmup and validation pass through Capability Builder.",
        "Wrapper returns bounded JSON/text previews and writes full extracted content by path when large.",
        "Anti-abuse, robots, rate limit, and authentication boundaries are stated in SKILL guidance.",
      ],
      fallbackGuidance: [
        "Use Ambient browser/Playwright when the task needs authenticated browsing, visual state, or Chrome compatibility.",
        "Use Lightpanda only for lower-overhead browser research after a compatibility smoke test.",
      ],
    },
    bestFor: ["Structured extraction experiments", "Local scraping wrappers", "Static HTML extraction with real package dogfood", "Anti-bot-aware extraction research"],
    tradeoffs: ["Needs careful anti-abuse guidance", "May require browser dependencies", "Dynamic browser-backed modes need separate validation from static extraction"],
    avoidWhen: ["The workflow involves authenticated user-visible browsing better handled by Ambient browser tools"],
    platforms: ["macos-arm64", "macos-x64", "linux-x64", "windows-x64"],
    hardwareFit: ["Local Python/runtime dependencies, browser cost depends on mode"],
    capabilityBuilderDefaults: {
      provider: "Scrapling",
      locality: "local",
      responseFormats: ["json", "html", "text"],
    },
    ambientContract: {
      commandContract: "Scraping command returns extracted text/structured data and preserves full output when large.",
      descriptorRequirements: ["browser-tooling or custom-cli installer shape", "bounded response preview", "full output artifact path for large content"],
      artifactPolicy: "Write large extracted content to workspace artifacts and return previews to Pi.",
      validationTarget: "Extract from a controlled fixture and one public page.",
    },
    secrets: [],
    networkHosts: [],
    modelAssets: [],
    runtimeState: { externalService: false, serviceKind: "none" },
    costPrivacyNotes: ["Network requests go directly from the user's machine."],
    maintenanceNotes: ["Pin dependency versions, document browser/runtime requirements, and re-run the real-package dogfood when Scrapling releases change selector behavior."],
    safetyBoundaries: ["Obey user intent, authentication boundaries, site terms, robots where applicable, and rate limits."],
    knownQuirks: ["Dynamic sites may still require full browser automation.", "Recent releases changed selector return shapes, so wrapper tests should assert exact JSON output."],
    researchStatus: "live-dogfooded",
    evidence: [
      { date: reviewedAt, type: "docs-review", summary: "GitHub project reviewed as requested scraping candidate." },
      { date: reviewedAt, type: "pi-live-dogfood", summary: "Existing live Capability Builder dogfood installs/warm-runs real Scrapling dependencies, validates/registers/uses static extraction, unregisters/re-registers, repairs, and validates again." },
    ],
    docs: [
      { label: "Scrapling", url: "https://github.com/D4Vinci/Scrapling", lastReviewed: reviewedAt },
      { label: "Capability Builder Scrapling dogfood notes", url: "capabilityBuilderSpec.md", lastReviewed: reviewedAt },
    ],
  },
  {
    id: "scrape.lightpanda",
    displayName: "Lightpanda Browser",
    capabilityArea: "web-scraping",
    installerShape: "browser-tooling",
    providerKind: "local",
    sourceModel: "open-source",
    recommendationTier: "conditional",
    recommendationSummary: "Programmable browser candidate for scraping/browser automation with lower overhead than full Chrome in some workflows.",
    recommendationMemo: {
      deploymentRole: "research",
      recommendation: "Research Lightpanda as a lower-overhead browser backend, but do not present it as a Chrome/Playwright replacement until target-page compatibility and install lifecycle are dogfooded.",
      dogfoodTargets: [
        "Download the nightly macOS or Linux binary into a temporary provider-local path and run a fixture fetch.",
        "Run one public-page extraction through fetch/CDP mode and compare output against Chrome/Playwright or Scrapling.",
        "Record binary version, platform, startup time, memory observations if available, JavaScript/Web API limitations, and CDP compatibility issues.",
      ],
      promotionCriteria: [
        "Provider-local binary install and health check are deterministic on macOS arm64 and Linux x64.",
        "Controlled fixture plus public-page extraction match expected content without requiring user Chrome profile state.",
        "Known unsupported Web APIs and rendering gaps are documented for Pi before recommendation.",
      ],
      fallbackGuidance: [
        "Use Ambient browser/Chrome when compatibility, authenticated profile state, or visual parity matters.",
        "Use Scrapling for public/static extraction when a full browser backend is unnecessary.",
      ],
    },
    bestFor: ["Headless browser scraping research", "Local automation wrappers"],
    tradeoffs: ["Compatibility differs from Chrome/Playwright", "Needs real-page dogfood before recommendation"],
    avoidWhen: ["The task requires the user's authenticated Chrome profile or exact browser parity"],
    platforms: ["macos-arm64", "linux-x64"],
    hardwareFit: ["Local binary/runtime dependency"],
    capabilityBuilderDefaults: {
      provider: "Lightpanda",
      locality: "local",
      responseFormats: ["json", "html", "text"],
    },
    ambientContract: {
      commandContract: "Browser tooling command returns bounded extracted content and saves large traces/output by path.",
      descriptorRequirements: ["browser-tooling installer shape", "health check declaration"],
      artifactPolicy: "Save debug traces/screenshots only when needed and disclose paths.",
      validationTarget: "Load a controlled fixture and a public page, then compare extracted content.",
    },
    secrets: [],
    networkHosts: [],
    modelAssets: [],
    runtimeState: { externalService: false, serviceKind: "none" },
    costPrivacyNotes: ["Network requests originate locally."],
    maintenanceNotes: ["Track nightly binary install/update strategy, Docker image availability, CDP compatibility, and unsupported Web APIs per platform."],
    safetyBoundaries: ["Do not bypass platform authentication, consent, or anti-abuse protections."],
    knownQuirks: ["Browser compatibility needs validation against real target pages.", "Web API support is partial and work-in-progress, so Chrome parity should not be assumed."],
    researchStatus: "researched",
    evidence: [{ date: reviewedAt, type: "docs-review", summary: "GitHub project reviewed as requested browser/scraping candidate." }],
    docs: [{ label: "Lightpanda Browser", url: "https://github.com/lightpanda-io/browser", lastReviewed: reviewedAt }],
  },
  {
    id: "retrieval.reason-moderncolbert",
    displayName: "Reason-ModernColBERT",
    capabilityArea: "retrieval",
    installerShape: "custom-cli",
    providerKind: "local",
    sourceModel: "open-source",
    recommendationTier: "experimental",
    recommendationSummary: "Local late-interaction retrieval candidate for reasoning-intensive retrieval and possible Ambient-specific retriever training.",
    recommendationMemo: {
      deploymentRole: "research",
      recommendation: "Use Reason-ModernColBERT as the first local late-interaction retrieval research candidate for Ambient-owned corpus/index experiments; do not promote it until index lifecycle, license/data lineage, and baseline quality are proven.",
      dogfoodTargets: [
        "Build a tiny local PyLate/ColBERT index from a fixed two-to-five document corpus in a provider-owned cache directory.",
        "Run at least two fixed reasoning-heavy queries and compare ranks against BM25 and a simple dense/vector baseline.",
        "Record model cache path, index directory, corpus provenance, Python/package versions, memory use notes, and index refresh behavior.",
      ],
      promotionCriteria: [
        "Tiny corpus/index smoke test is deterministic and stores full index/evaluation artifacts by path.",
        "Reasoning queries beat or match BM25/simple-vector baselines on the chosen fixed corpus without hiding misses.",
        "License, data-lineage, and commercial-use constraints are reviewed before any user-facing recommendation.",
      ],
      fallbackGuidance: [
        "Use deterministic BM25/FTS or a simple embedding baseline when packaging speed and debuggability matter more than reasoning-aware retrieval.",
        "Use AgentIR when the experiment specifically needs agent reasoning trace plus query embedding and can afford a 4B retriever.",
      ],
    },
    bestFor: ["Reasoning-aware retrieval", "Local retriever experiments", "Training or adapting an Ambient retrieval layer"],
    tradeoffs: ["Needs corpus/index integration", "License and data lineage need review before recommendation", "Late-interaction indexing is more complex than simple embeddings"],
    avoidWhen: ["The user needs a simple deterministic retrieval baseline today", "Commercial license/data constraints have not been reviewed for the intended use"],
    platforms: ["macos-arm64", "linux-x64"],
    hardwareFit: ["Small by modern retrieval-model standards, but indexing cost depends on corpus size"],
    capabilityBuilderDefaults: {
      provider: "Reason-ModernColBERT",
      locality: "local",
      responseFormats: ["json"],
      modelAssets: ["lightonai/Reason-ModernColBERT"],
    },
    ambientContract: {
      commandContract: "Retriever wrapper must build/query an explicit local corpus index and return ranked document ids/snippets with scores.",
      descriptorRequirements: ["model asset declaration", "index state notes", "corpus provenance notes", "response format declaration"],
      artifactPolicy: "Persist index state and evaluation outputs by path; return only bounded ranked previews to Pi.",
      validationTarget: "Build a tiny local index, retrieve against a fixed corpus, and compare ranking to BM25/vector baselines.",
    },
    secrets: [],
    networkHosts: [],
    modelAssets: [{ name: "lightonai/Reason-ModernColBERT", sourceUrl: "https://huggingface.co/lightonai/Reason-ModernColBERT", licenseNote: "Review non-commercial training-data constraints before promotion.", cachePolicy: "Local model cache plus explicit corpus index directory." }],
    localArtifactReadiness: {
      status: "conditional-local",
      verifiedArtifacts: ["Hugging Face model card", "PyLate/ColBERT usage path", "long-document retrieval notes"],
      missingOrBlockingArtifacts: ["Ambient-specific corpus/index adapter", "license/data-lineage approval", "task-quality comparison against simpler baselines"],
      minimumLocalSmokeTest: "Build a two-document index and verify a fixed reasoning query ranks the intended document above the distractor.",
    },
    runtimeState: { externalService: false, serviceKind: "none", statePaths: ["retrieval index directory", "model cache"] },
    costPrivacyNotes: ["Local corpus indexing avoids cloud upload when model/assets are local."],
    maintenanceNotes: ["Track corpus provenance, index refresh policy, PyLate/Sentence Transformers/runtime versions, model-cache revision, and baseline comparison results."],
    safetyBoundaries: ["Do not treat retrieval scores as verified facts or promote for commercial use until license constraints are reviewed."],
    knownQuirks: ["Late-interaction retrieval requires index-specific storage and can be harder to package than simple dense embeddings.", "The model is small by current retrieval standards but still requires explicit corpus/index state."],
    researchStatus: "researched",
    evidence: [{ date: reviewedAt, type: "docs-review", summary: "Hugging Face model card reviewed as a high-priority local retrieval research card with PyLate/ColBERT usage path and 0.1B model size." }],
    docs: [{ label: "Reason-ModernColBERT", url: "https://huggingface.co/lightonai/Reason-ModernColBERT", lastReviewed: reviewedAt }],
  },
  {
    id: "retrieval.agentir",
    displayName: "AgentIR-4B",
    capabilityArea: "retrieval",
    installerShape: "custom-cli",
    providerKind: "local",
    sourceModel: "open-source",
    recommendationTier: "experimental",
    recommendationSummary: "Reasoning-trace-aware retrieval component for deep research loops, not a full deep-research agent.",
    recommendationMemo: {
      deploymentRole: "research",
      recommendation: "Use AgentIR as a specialized deep-research retrieval component when the retriever should embed the agent reasoning trace with the query; do not present it as a standalone deep-research provider.",
      dogfoodTargets: [
        "Load Tevatron/AgentIR-4B with Transformers and embed one fixed reasoning/query pair plus a two-document corpus.",
        "Verify the intended document ranks above the distractor and compare against BM25/simple-vector and Reason-ModernColBERT baselines.",
        "Record model cache size, device requirements, runtime latency, index/corpus state, and whether the experiment used the AgentIR repo or only the Hugging Face model.",
      ],
      promotionCriteria: [
        "Local smoke test runs on an approved target host without hidden global model/index state.",
        "Reasoning-trace-aware retrieval shows a documented advantage over Reason-ModernColBERT or simpler baselines for at least one Ambient research task.",
        "Pi guidance labels AgentIR as retrieval infrastructure and keeps answer synthesis/fact verification in separate tools.",
      ],
      fallbackGuidance: [
        "Use Reason-ModernColBERT for a smaller late-interaction local retriever experiment.",
        "Use deterministic BM25/FTS or simple embeddings for fast, inspectable retrieval baselines.",
        "Use full deep-research agent cards only after retrieval, search, scraping, and report-generation contracts are composed.",
      ],
    },
    bestFor: ["Agentic retrieval experiments", "Reasoning-aware query embedding", "Deep research retrieval infrastructure"],
    tradeoffs: ["4B retriever is heavier than classic embeddings", "Requires corpus/index integration"],
    avoidWhen: ["The user expects a complete research agent rather than a retriever"],
    platforms: ["linux-x64", "macos-arm64"],
    hardwareFit: ["Best with GPU or carefully managed local inference"],
    capabilityBuilderDefaults: {
      provider: "AgentIR",
      locality: "local",
      responseFormats: ["json"],
      modelAssets: ["Tevatron/AgentIR-4B"],
    },
    ambientContract: {
      commandContract: "Retriever command embeds query/reasoning and documents or searches a prepared index.",
      descriptorRequirements: ["model asset declaration", "response format declaration", "index state notes"],
      artifactPolicy: "Index state and corpora must be explicit; do not hide large generated indexes.",
      validationTarget: "Build a tiny local index and compare retrieval against BM25/vector baselines.",
    },
    secrets: [],
    networkHosts: [],
    modelAssets: [{ name: "Tevatron/AgentIR-4B", sourceUrl: "https://huggingface.co/Tevatron/AgentIR-4B", expectedSize: "4B params" }],
    localArtifactReadiness: {
      status: "component-only",
      verifiedArtifacts: ["Hugging Face model", "GitHub code", "quick Transformers usage", "data links", "project page and paper"],
      missingOrBlockingArtifacts: ["Complete deep-research agent orchestration", "Ambient-owned corpus/index adapter", "baseline comparison evidence"],
      minimumLocalSmokeTest: "Embed one reasoning/query pair and two docs, then verify ranking output against BM25/simple-vector and Reason-ModernColBERT baselines.",
    },
    runtimeState: { externalService: false, serviceKind: "none", statePaths: ["retrieval index directory"] },
    costPrivacyNotes: ["Local model and corpus processing can avoid cloud upload."],
    maintenanceNotes: ["Track corpus provenance, index refresh policy, model cache size, device/runtime requirements, and repo/model revision."],
    safetyBoundaries: ["Do not represent retrieval scores as verified facts."],
    knownQuirks: ["Useful as infrastructure, not a standalone answerer.", "The 4B retriever is heavier than standard embedding baselines and should be justified by reasoning-trace quality wins."],
    researchStatus: "researched",
    evidence: [{ date: reviewedAt, type: "docs-review", summary: "AgentIR model card and repo expose model, code, data, project page, paper, and quick Transformers usage for component smoke tests." }],
    docs: [
      { label: "AgentIR model", url: "https://huggingface.co/Tevatron/AgentIR-4B", lastReviewed: reviewedAt },
      { label: "AgentIR code", url: "https://github.com/texttron/AgentIR", lastReviewed: reviewedAt },
    ],
  },
  {
    id: "deep.literesearcher-4b",
    displayName: "Local Deep Research (LiteResearcher-4B)",
    capabilityArea: "deep-research",
    installerShape: "custom-cli",
    providerKind: "hybrid",
    sourceModel: "open-source",
    recommendationTier: "recommended",
    recommendationSummary: "First-party Local Deep Research path using LiteResearcher-4B through Ambient-managed llama.cpp, pinned Q4/Q8 GGUF profiles, 16k target context, and Ambient-brokered search/fetch preferences.",
    recommendationMemo: {
      deploymentRole: "primary",
      recommendation: "Use the first-party Local Deep Research setup when the user wants local mixed-source research from Ambient Desktop. LiteResearcher-4B provides the local reasoning/tool-call model, while Ambient resolves search and fetch providers from the user's current Search & Web preferences at run start.",
      dogfoodTargets: [
        "Run ambient_local_deep_research_setup validate and smoke against the selected pinned LiteResearcher-4B profile through the shared Ambient-managed llama.cpp runtime.",
        "Run one bounded mixed multi-source research task through ambient_local_deep_research_run and verify provider snapshot, search/fetch trace, final citations, and run artifact paths.",
        "Compare the same benchmark with Q4_K_M and Q8_0, keeping Q8 defaulted to high-memory hosts or explicit override with memory preflight.",
        "Change Search & Web provider preferences and verify the next run records the new provider snapshot without changing the installed model.",
      ],
      promotionCriteria: [
        "Setup/install/repair/validate/smoke actions expose managed model/runtime status, memory policy, provider snapshot, and user-visible diagnostics.",
        "Run artifacts include model profile, 16k/8k context decision, provider preference snapshot, tool executions, sources, final report, and deterministic citation validation.",
        "The estimated release gate passes with labeled 16/32/64 GB host-class telemetry plus real current-host telemetry, with strict real-only telemetry tracked separately as hardening.",
        "Search and scraping provider changes affect the next run through Ambient-owned provider preference resolution, not through model reinstall or upstream Serper/Scrape.do keys.",
      ],
      fallbackGuidance: [
        "Use DR-Venus-4B when comparing another 4B search/visit agent with GGUF/checkpoint options.",
        "Use Infoseeker-4B Reproduction for DDGS/tool-server and tool-format experiments.",
        "Use OpenResearcher or OpenSeeker only on server-class hardware.",
      ],
    },
    bestFor: ["First-party local deep research", "Ambient-approved search/fetch provider routing", "Mixed multi-source synthesis with inspectable citations", "Privacy-sensitive local reasoning with provider-aware web access"],
    tradeoffs: ["Search/fetch still uses the user's configured providers and may contact cloud services", "Q8 and 16k context need memory-aware process supervision", "Strict 16/32/64 GB physical-host telemetry is still tracked as post-release hardening"],
    avoidWhen: ["The user needs fully offline research with no web provider calls", "The machine cannot hold the selected local model profile or a managed llama.cpp process"],
    platforms: ["macos-arm64", "linux-x64", "windows-x64"],
    platformSupport: [
      {
        platform: "macos-arm64",
        status: "supported",
        runtime: "shared Ambient-managed llama.cpp Metal runtime with pinned LiteResearcher-4B GGUF profile",
        installMode: "Recommended managed install through ambient_local_deep_research_setup with Q4 default on non-high-memory hosts and Q8 on workstation-class hosts or approved override.",
        evidence: ["Real Q4 GGUF smoke", "Q8 live Ambient/Pi mixed-source run under GMI Cloud", "Q4/Q8 profile benchmark", "Estimated release gate with current 128 GB+ host telemetry"],
        caveats: ["Estimated 16/32/64 GB host-class telemetry remains labeled until physical-host hardening evidence is imported."],
      },
      {
        platform: "linux-x64",
        status: "conditional",
        runtime: "shared Ambient-managed llama.cpp Vulkan candidate",
        installMode: "Manifest-shaped and policy-tested; keep managed install conditional until Linux runtime/platform smoke evidence lands.",
        evidence: ["Runtime platform certification row", "Shared llama.cpp manifest policy"],
        caveats: ["GPU/backend, driver, process lifecycle, and cache behavior need real Linux validation before default enablement."],
      },
      {
        platform: "windows-x64",
        status: "experimental",
        runtime: "shared llama.cpp Windows x64 CPU candidate",
        installMode: "Pinned but default-disabled until Windows process lifecycle, path quoting, local firewall, and cache behavior are validated.",
        evidence: ["Runtime platform certification row"],
        caveats: ["No real Windows smoke evidence yet; GPU support is deferred."],
      },
    ],
    hardwareFit: [
      "Q4_K_M is the default profile for most hosts and targets 16k context, with 8k safe mode below 24 GiB or under pressure.",
      "Q8_0 is the high-memory and advanced override profile; default selection starts at 64 GiB with Q4 fallback under pressure.",
    ],
    firstPartyTemplate: {
      available: true,
      templateId: "local-deep-research:literesearcher-llamacpp",
      notes: "Use ambient_local_deep_research_setup for status/install/repair/validate/smoke and ambient_local_deep_research_run for bounded research; do not scaffold a custom Capability Builder package for the first-party path.",
    },
    capabilityBuilderDefaults: {
      provider: "Local Deep Research (LiteResearcher-4B)",
      locality: "local",
      responseFormats: ["text", "json"],
      envNames: [],
      networkHosts: ["huggingface.co", "github.com", "localhost"],
      modelAssets: localDeepResearchModelAssetNames(),
    },
    ambientContract: {
      commandContract: "First-party setup tool installs/repairs/validates/smokes the managed LiteResearcher model and shared llama.cpp runtime; first-party run tool executes bounded research with Ambient-brokered search/fetch, provider preference snapshots, model profile selection, trace capture, and citation validation.",
      descriptorRequirements: ["first-party capability id local.deep-research.literesearcher", "ambient_local_deep_research_setup action contract", "ambient_local_deep_research_run input/result contract", "pinned Q4/Q8 model asset declaration", "shared llama.cpp runtime manifest", "Ambient search/fetch provider preference snapshot", "run artifact and citation-validation schema"],
      artifactPolicy: "Save setup validation, smoke, provider preference smoke, memory telemetry, full run traces, sources, final reports, and citation-validation details; return bounded previews to Pi.",
      validationTarget: "Run setup validate/smoke plus a bounded mixed multi-source synthesis task through Ambient/Pi, then inspect provider preference snapshot, tool-call evidence, citation validation, runtime/profile metadata, and persisted artifacts.",
    },
    secrets: [],
    networkHosts: ["huggingface.co", "github.com", "localhost"],
    modelAssets: localDeepResearchModelProfilesManifest.profiles.map((profile) => ({
      name: `${profile.repoId}:${profile.quantization}`,
      sourceUrl: profile.sourceUrl,
      expectedSize: `${profile.filename}; ${profile.sizeBytes} bytes; sha256 ${profile.sha256}`,
      licenseNote: profile.licenseNote,
      cachePolicy: "Ambient model cache under the Local Deep Research capability; not bundled into the app.",
    })),
    localArtifactReadiness: {
      status: "local-ready",
      verifiedArtifacts: ["Pinned Q4_K_M GGUF metadata", "Pinned Q8_0 GGUF metadata", "released inference code", "search/visit tool protocol", "shared Ambient-managed llama.cpp runtime install path", "Local Deep Research setup/install/repair/validate/smoke tool", "Local Deep Research run tool", "provider preference snapshot and smoke coverage", "deterministic citation validation", "Q4 real GGUF smoke", "Q8 live Ambient/Pi mixed-source run under GMI Cloud", "Q4/Q8 mixed-source profile benchmark", "estimated memory telemetry release gate"],
      missingOrBlockingArtifacts: ["Strict real-only 16/32/64 GB physical-host telemetry before release hardening; not blocking the current estimated implementation gate"],
      minimumLocalSmokeTest: "Run ambient_local_deep_research_setup validate, run ambient_local_deep_research_setup smoke against the selected GGUF profile, then run one bounded mixed multi-source synthesis task through ambient_local_deep_research_run and verify provider snapshot, source trace, final report, and citation validation.",
    },
    runtimeState: {
      externalService: true,
      serviceKind: "local-daemon",
      statePaths: ["Ambient-managed model cache", "shared llama.cpp runtime cache", ".ambient/local-deep-research validation, smoke, memory, provider-preference, server, and run artifacts"],
      healthCheck: "ambient_local_deep_research_setup validate plus optional smoke against the selected GGUF profile and shared llama.cpp runtime.",
      updatePolicy: "Pinned LiteResearcher GGUF revision and pinned shared runtime manifests; no automatic model/runtime upgrades.",
    },
    costPrivacyNotes: ["LiteResearcher model inference runs locally after model/runtime assets are installed.", "The user's selected Ambient search/fetch providers may receive queries, URLs, or fetched pages and may incur provider cost.", "Model/runtime downloads contact declared model/runtime hosts."],
    maintenanceNotes: ["Keep local model serving separate from search/scraping provider setup.", "Track pinned GGUF revision, checksums, memory policy, context policy, provider preference snapshot schema, citation-validation schema, and release-gate evidence."],
    safetyBoundaries: ["Do not claim the capability is ready until ambient_local_deep_research_setup reports ready or validation passes.", "Do not bypass Ambient provider preference routing with upstream Serper/Scrape.do keys.", "Do not treat unobserved final citation URLs as valid sources."],
    knownQuirks: ["Uses ReAct-style search/visit tags internally and expects compatible first-party tool handling.", "Separate llama-server processes make memory additive with MiniCPM; supervisor leases serialize or fallback under pressure.", "Estimated 16/32/64 GB memory telemetry is accepted for the current gate but remains labeled until strict physical-host evidence is imported."],
    researchStatus: "live-dogfooded",
    evidence: [
      { date: reviewedAt, type: "docs-review", summary: "Initial LiteResearcher review identified the local-small model, tool protocol, and setup artifacts that became the first-party Local Deep Research path." },
      { date: "2026-05-28", type: "docs-review", summary: "Pinned LiteResearcher Q4_K_M and Q8_0 GGUF profile metadata from Hugging Face repo revision for Ambient-managed local model selection." },
      { date: "2026-05-28", type: "local-smoke", summary: "Real Q4 GGUF smoke passed through the shared Ambient-managed llama.cpp runtime, setup validation, provider preference smoke, and memory telemetry artifacts." },
      { date: "2026-05-28", type: "pi-live-dogfood", summary: "GMI-backed Ambient/Pi live run used the Q8 profile at 16k context, executed four research tool calls through Ambient provider routing, persisted run artifacts, and passed citation validation." },
    ],
    docs: [
      { label: "LiteResearcher repo", url: "https://github.com/simplex-ai-inc/LiteResearcher", lastReviewed: reviewedAt },
      { label: "LiteResearcher model", url: "https://huggingface.co/simplex-ai-inc/LiteResearcher-4B", lastReviewed: reviewedAt },
      { label: "LiteResearcher GGUF profiles", url: "https://huggingface.co/mradermacher/LiteResearcher-4B-GGUF", lastReviewed: "2026-05-28" },
    ],
  },
  {
    id: "deep.openresearcher",
    displayName: "OpenResearcher",
    capabilityArea: "deep-research",
    installerShape: "custom-cli",
    providerKind: "local",
    sourceModel: "open-source",
    recommendationTier: "experimental",
    recommendationSummary: "Strong fully open deep-research reference with enough artifacts, but too GPU-heavy for default desktop guidance.",
    recommendationMemo: {
      deploymentRole: "reserved",
      recommendation: "Use OpenResearcher as a deployment-heavy lab/server reference for fully open deep-research orchestration, not as the desktop recommendation; the reviewed path expects substantial GPU capacity and multi-service search/model setup.",
      dogfoodTargets: [
        "On an approved GPU server, start the documented vLLM and search services and run one tiny BrowseComp/GAIA-style task.",
        "Save service logs, local-search state, model revision, full trace/source/report artifacts, and GPU/runtime footprint notes.",
        "Compare the same prompt against LiteResearcher-4B or DR-Venus-4B so deployment cost is measured against a local-small candidate.",
      ],
      promotionCriteria: [
        "A server-class validation host is documented, including GPU count/VRAM, service lifecycle, and reproducible startup/shutdown steps.",
        "The offline/local search path is validated without requiring users to discover hidden service state.",
        "Pi guidance clearly reserves this card for lab/server evaluation and does not route desktop users here by default.",
      ],
      fallbackGuidance: [
        "Use LiteResearcher-4B as the first local-small smoke candidate.",
        "Use DR-Venus-4B or AgentCPM-Explore when a 4B/GGUF-capable path is more important than full OpenResearcher parity.",
        "Use Step-DeepResearch only as a hosted/API reference, not as a local replacement.",
      ],
    },
    bestFor: ["Lab/server deep research experiments", "Offline search environment study", "Training/eval recipe reference"],
    tradeoffs: ["Multi-service setup", "GPU-heavy vLLM and dense search path"],
    avoidWhen: ["The user expects laptop-friendly local setup"],
    platforms: ["linux-x64"],
    hardwareFit: ["Repo references 8 A100 80 GB setup and examples using multiple GPUs"],
    capabilityBuilderDefaults: {
      provider: "OpenResearcher",
      locality: "local",
      responseFormats: ["text", "json"],
      envNames: ["SERPER_API_KEY"],
      networkHosts: ["serper.dev"],
      modelAssets: ["OpenResearcher/OpenResearcher-30B-A3B"],
    },
    ambientContract: {
      commandContract: "Server/lab wrapper starts model/search services explicitly and runs bounded evaluation tasks.",
      descriptorRequirements: ["model asset declaration", "service state notes", "trace artifact output"],
      artifactPolicy: "Save logs, traces, and report outputs by path.",
      validationTarget: "Smoke test only on a machine with enough GPU/server capacity.",
    },
    secrets: [{ envName: "SERPER_API_KEY", required: false, capture: "ambient_capability_builder_secret_request" }],
    networkHosts: ["serper.dev"],
    modelAssets: [{ name: "OpenResearcher/OpenResearcher-30B-A3B", sourceUrl: "https://huggingface.co/OpenResearcher/OpenResearcher-30B-A3B", expectedSize: "32B params", licenseNote: "MIT" }],
    localArtifactReadiness: {
      status: "deployment-heavy",
      verifiedArtifacts: ["Code", "model checkpoint", "dataset links", "offline search setup", "run scripts", "benchmark/evaluation paths"],
      missingOrBlockingArtifacts: ["Desktop-friendly resource profile"],
      minimumLocalSmokeTest: "On a GPU server, start vLLM/search services and run one bounded BrowseComp/GAIA-style task.",
    },
    runtimeState: { externalService: true, serviceKind: "local-daemon", statePaths: ["logs", "local search index", "model cache"] },
    costPrivacyNotes: ["Can use local search for some benchmarks; Serper path sends queries externally."],
    maintenanceNotes: ["Treat as lab/server card until resource footprint is measured on Ambient hardware."],
    safetyBoundaries: ["Do not present as default local-desktop recommendation."],
    knownQuirks: ["Requires trust_remote_code for direct Transformers usage and substantial serving resources."],
    researchStatus: "researched",
    evidence: [{ date: reviewedAt, type: "docs-review", summary: "Enough artifacts exist, but deployment is heavy." }],
    docs: [
      { label: "OpenResearcher repo", url: "https://github.com/TIGER-AI-Lab/OpenResearcher", lastReviewed: reviewedAt },
      { label: "OpenResearcher model", url: "https://huggingface.co/OpenResearcher/OpenResearcher-30B-A3B", lastReviewed: reviewedAt },
    ],
  },
  {
    id: "deep.step-deepresearch",
    displayName: "Step-DeepResearch",
    capabilityArea: "deep-research",
    installerShape: "custom-cli",
    providerKind: "cloud",
    sourceModel: "closed-source",
    recommendationTier: "research-needed",
    recommendationSummary: "Hosted/API reference for deep research orchestration; not local-ready until downloadable weights or local inference instructions exist.",
    recommendationMemo: {
      deploymentRole: "reserved",
      recommendation: "Use Step-DeepResearch only as a hosted/API reference for deep-research orchestration until downloadable weights or documented local inference are available; do not use it to validate local-small-model onboarding.",
      dogfoodTargets: [
        "If StepFun credentials are intentionally provided through Ambient-managed secret capture, run one hosted tiny research task and save trace/source/report artifacts.",
        "Verify the wrapper never exposes STEP_MODEL_API_KEY or STEP_SEARCH_API_KEY in prompts, tool args, logs, descriptors, or artifacts.",
        "Record hosted API latency, cost/privacy notes, error shapes, and how its orchestration compares with local-small candidates.",
      ],
      promotionCriteria: [
        "Credentialed hosted dogfood succeeds with no secret leakage and with clear report/source artifacts.",
        "Documentation or model releases establish whether any local path exists; until then, the card remains hosted-reference only.",
        "Selection guidance names LiteResearcher-4B, DR-Venus-4B, Infoseeker-4B Reproduction, or AgentCPM-Explore for local-small research.",
      ],
      fallbackGuidance: [
        "Use LiteResearcher-4B as the first local-small candidate.",
        "Use DR-Venus-4B or Infoseeker-4B Reproduction for 4B search/visit or DDGS/tool-server experiments.",
        "Use OpenResearcher/OpenSeeker only when server-class local open systems are explicitly desired.",
      ],
    },
    bestFor: ["Research reference", "Hosted StepFun API experiments if credentials are intentionally provided"],
    tradeoffs: ["Requires StepFun API/search keys", "No verified local weights path in the reviewed quick start"],
    avoidWhen: ["The user asks for local deep research"],
    platforms: ["any"],
    hardwareFit: ["Hosted API path avoids local model serving"],
    capabilityBuilderDefaults: {
      provider: "Step-DeepResearch",
      locality: "network",
      responseFormats: ["text", "json"],
      envNames: ["STEP_MODEL_API_KEY", "STEP_SEARCH_API_KEY"],
      networkHosts: ["api.stepfun.com"],
    },
    ambientContract: {
      commandContract: "Hosted workflow wrapper must declare StepFun model/search credentials and save traces/reports.",
      descriptorRequirements: ["required env declarations", "hosted-reference readiness", "trace artifact output"],
      artifactPolicy: "Save report and trace artifacts, never secret values.",
      validationTarget: "Test only as hosted/API workflow with explicitly provided StepFun credentials.",
    },
    secrets: [
      { envName: "STEP_MODEL_API_KEY", required: true, capture: "ambient_capability_builder_secret_request" },
      { envName: "STEP_SEARCH_API_KEY", required: true, capture: "ambient_capability_builder_secret_request" },
    ],
    networkHosts: ["api.stepfun.com"],
    modelAssets: [],
    localArtifactReadiness: {
      status: "hosted-reference",
      verifiedArtifacts: ["Demo app", "orchestration code", "hosted API quick start"],
      missingOrBlockingArtifacts: ["Downloadable local weights", "documented local model path"],
      minimumLocalSmokeTest: "None until local weights/inference are released; hosted smoke requires StepFun credentials.",
    },
    runtimeState: { externalService: true, serviceKind: "hosted-api" },
    costPrivacyNotes: ["Queries and research tasks go to StepFun hosted services."],
    maintenanceNotes: ["Re-check if local weights or local inference path are released."],
    safetyBoundaries: ["Do not use to validate local deep-research onboarding."],
    knownQuirks: ["Quick start points to beta API access rather than local model setup."],
    researchStatus: "researched",
    evidence: [{ date: reviewedAt, type: "docs-review", summary: "Repo reviewed and classified as hosted-reference." }],
    docs: [
      { label: "StepDeepResearch repo", url: "https://github.com/stepfun-ai/StepDeepResearch", lastReviewed: reviewedAt },
      { label: "Step-DeepResearch paper", url: "https://arxiv.org/abs/2512.20491", lastReviewed: reviewedAt },
    ],
  },
  {
    id: "deep.dr-venus-4b",
    displayName: "DR-Venus-4B",
    capabilityArea: "deep-research",
    installerShape: "custom-cli",
    providerKind: "hybrid",
    sourceModel: "open-source",
    recommendationTier: "experimental",
    recommendationSummary: "Promising 4B edge-scale deep research agent with released code/checkpoints, but external tools remain part of the reference path.",
    recommendationMemo: {
      deploymentRole: "research",
      recommendation: "Use DR-Venus-4B as the second local-small deep-research candidate after LiteResearcher when comparing 4B search/visit agents, especially where GGUF/checkpoint options matter; keep external Serper/Jina/summarizer/judge dependencies explicit.",
      dogfoodTargets: [
        "Configure a reviewed checkpoint or GGUF path, run run_demo or the web demo with approved search/visit tools, and bound the task tightly.",
        "Save model revision, tool endpoint config, full trace/source/report artifacts, and notes for every external search/fetch/summarizer/judge dependency.",
        "Compare one identical tiny task against LiteResearcher-4B and a deterministic search/scrape baseline for citation quality and tool-call reliability.",
      ],
      promotionCriteria: [
        "Ambient adapter handles search/visit protocol cleanly and stores trace/source/report artifacts without semantic output repair.",
        "GGUF or checkpoint path runs on an approved local target with measured latency, memory, and tool-step bounds.",
        "External dependency guidance distinguishes local model execution from networked search/fetch/summarizer/judge services.",
      ],
      fallbackGuidance: [
        "Use LiteResearcher-4B for the first local-small smoke because its role is clearer.",
        "Use Infoseeker-4B Reproduction for DDGS/tool-server experiments with a simpler reproduction shape.",
        "Use AgentCPM-Explore when the experiment is primarily about AgentDock/MCP tool sandboxing.",
      ],
    },
    bestFor: ["Small local/open deep research research", "Search/visit tool protocol comparison"],
    tradeoffs: ["External search/fetch/summarizer/judge dependencies", "Needs Ambient adapter dogfood"],
    avoidWhen: ["The user wants production-ready local-only research"],
    platforms: ["linux-x64", "macos-arm64"],
    hardwareFit: ["4B model; GGUF exists, but long-context agent use still needs measurement"],
    capabilityBuilderDefaults: {
      provider: "DR-Venus-4B",
      locality: "either",
      responseFormats: ["text", "json"],
      envNames: ["SERPER_API_KEY"],
      networkHosts: ["serper.dev", "r.jina.ai"],
      modelAssets: ["inclusionAI/DR-Venus-4B-RL"],
    },
    ambientContract: {
      commandContract: "Wrapper runs bounded search/visit tasks and records full trace/source artifacts.",
      descriptorRequirements: ["model asset declaration", "search/visit tool protocol notes", "external dependency declarations"],
      artifactPolicy: "Save full trace, sources, and final report artifacts.",
      validationTarget: "Run one bounded task through approved search/visit tools and inspect formatting/tool reliability.",
    },
    secrets: [{ envName: "SERPER_API_KEY", required: false, capture: "ambient_capability_builder_secret_request" }],
    networkHosts: ["serper.dev", "r.jina.ai"],
    modelAssets: [{ name: "inclusionAI/DR-Venus-4B-RL", sourceUrl: "https://huggingface.co/inclusionAI/DR-Venus-4B-RL", expectedSize: "4B params" }],
    localArtifactReadiness: {
      status: "conditional-local",
      verifiedArtifacts: ["SFT/RL checkpoints", "GGUF versions", "SFT/RL/inference code", "search/visit tool protocol"],
      missingOrBlockingArtifacts: ["Fully local replacement for Serper/Jina/summarizer/judge dependencies"],
      minimumLocalSmokeTest: "Configure model path, run run_demo or web demo with approved tools, and inspect trace/source output.",
    },
    runtimeState: { externalService: true, serviceKind: "local-daemon", statePaths: ["model cache", "tool server logs", "research traces"] },
    costPrivacyNotes: ["Reference path can send search/fetch/summarization requests to external services."],
    maintenanceNotes: ["Track checkpoint choice, GGUF viability, and tool endpoint configuration."],
    safetyBoundaries: ["Keep as experimental until Ambient dogfoods tool-call and citation behavior."],
    knownQuirks: ["Claims long context and up to 200 tool-call steps; enforce bounded Ambient validation tasks."],
    researchStatus: "researched",
    evidence: [{ date: reviewedAt, type: "docs-review", summary: "Enough artifacts exist for conditional local smoke testing." }],
    docs: [
      { label: "DR-Venus repo", url: "https://github.com/inclusionAI/DR-Venus", lastReviewed: reviewedAt },
      { label: "DR-Venus RL model", url: "https://huggingface.co/inclusionAI/DR-Venus-4B-RL", lastReviewed: reviewedAt },
    ],
  },
  {
    id: "deep.openseeker-v1-30b",
    displayName: "OpenSeeker v1 30B SFT",
    capabilityArea: "deep-research",
    installerShape: "custom-cli",
    providerKind: "local",
    sourceModel: "open-source",
    recommendationTier: "experimental",
    recommendationSummary: "Fully open search-agent reference with model/data/code, but 31B BF16 weights make it server-class rather than desktop-default.",
    recommendationMemo: {
      deploymentRole: "reserved",
      recommendation: "Use OpenSeeker v1 30B SFT as a server-class open search-agent reference only when 31B/GPU resources are available; it is not a Qwen-4B-class desktop candidate.",
      dogfoodTargets: [
        "On a GPU/server host, deploy the model server with run_openseeker.sh and run one tiny generate_answer or eval task through declared search/visit tools.",
        "Save model revision, output JSONL, service logs, trace/source/report artifacts, and GPU/runtime footprint notes.",
        "Compare the same task against a 4B local-small candidate so quality gains are weighed against packaging and operating cost.",
      ],
      promotionCriteria: [
        "A reproducible GPU/server setup documents 31B model serving, startup/shutdown, and output artifact paths.",
        "Search/visit tool adapter is explicit and does not rely on hidden global state.",
        "Pi guidance keeps this reserved for lab/server experiments and routes desktop local-small asks to LiteResearcher-4B or DR-Venus-4B.",
      ],
      fallbackGuidance: [
        "Use LiteResearcher-4B or DR-Venus-4B for local-small exploration.",
        "Use OpenResearcher for a deployment-heavy fully open deep-research system comparison.",
        "Use Infoseeker-4B Reproduction when a smaller tool-server reproduction is enough.",
      ],
    },
    bestFor: ["Server-side search-agent experiments", "Open training data reference", "30B-class comparison"],
    tradeoffs: ["Large model", "Requires model server and search/visit tooling"],
    avoidWhen: ["The user needs a Qwen 4B-class local candidate"],
    platforms: ["linux-x64"],
    hardwareFit: ["31B BF16 model; plan for GPU/server resources"],
    capabilityBuilderDefaults: {
      provider: "OpenSeeker",
      locality: "local",
      responseFormats: ["text", "json"],
      modelAssets: ["PolarSeeker/OpenSeeker-v1-30B-SFT"],
    },
    ambientContract: {
      commandContract: "Server-class wrapper starts model server and runs bounded search/visit evaluation tasks.",
      descriptorRequirements: ["model asset declaration", "service state notes", "trace artifact output"],
      artifactPolicy: "Save traces, result JSONL, and evaluation outputs by path.",
      validationTarget: "Only smoke test on a machine with enough GPU/server capacity.",
    },
    secrets: [],
    networkHosts: [],
    modelAssets: [{ name: "PolarSeeker/OpenSeeker-v1-30B-SFT", sourceUrl: "https://huggingface.co/PolarSeeker/OpenSeeker-v1-30B-SFT", expectedSize: "31B params", licenseNote: "MIT" }],
    localArtifactReadiness: {
      status: "deployment-heavy",
      verifiedArtifacts: ["v1 model weights", "training data", "repo", "search/visit tools", "run_openseeker.sh", "evaluation scripts"],
      missingOrBlockingArtifacts: ["Desktop-friendly runtime profile"],
      minimumLocalSmokeTest: "Deploy model server with run_openseeker.sh and run one tiny eval/generate_answer task.",
    },
    runtimeState: { externalService: true, serviceKind: "local-daemon", statePaths: ["model cache", "outputs", "service logs"] },
    costPrivacyNotes: ["Local model can avoid hosted LLM calls, but web tools may still access external pages."],
    maintenanceNotes: ["Track v2 separately because model exists but repo says v2 code is coming soon."],
    safetyBoundaries: ["Do not mark as default local-desktop provider."],
    knownQuirks: ["Large BF16 checkpoint; GGUF quants exist but need separate validation."],
    researchStatus: "researched",
    evidence: [{ date: reviewedAt, type: "docs-review", summary: "Artifacts exist, but resource footprint is deployment-heavy." }],
    docs: [
      { label: "OpenSeeker repo", url: "https://github.com/rui-ye/OpenSeeker", lastReviewed: reviewedAt },
      { label: "OpenSeeker model", url: "https://huggingface.co/PolarSeeker/OpenSeeker-v1-30B-SFT", lastReviewed: reviewedAt },
    ],
  },
  {
    id: "deep.infoseeker-repro-4b",
    displayName: "Infoseeker-4B Reproduction",
    capabilityArea: "deep-research",
    installerShape: "custom-cli",
    providerKind: "hybrid",
    sourceModel: "open-source",
    recommendationTier: "experimental",
    recommendationSummary: "Research-grade 4B search-agent reproduction with enough artifacts for a local/tool-server smoke test.",
    recommendationMemo: {
      deploymentRole: "research",
      recommendation: "Use Infoseeker-4B Reproduction as a focused 4B tool-format and DDGS/tool-server experiment, not as a production deep-research recommendation.",
      dogfoodTargets: [
        "Run direct Transformers inference for one fixed prompt, then run a DDGS/tool-server search path for one fixed question.",
        "Save tool-server logs, emitted <search>/<answer> turns, source URLs/snippets, final answer, model revision, and runtime/error notes.",
        "Compare the answer and trace against LiteResearcher-4B or DR-Venus-4B to decide whether the reproduction is useful beyond tool-format learning.",
      ],
      promotionCriteria: [
        "DDGS/tool-server setup is reproducible and declared as local state with health checks and log paths.",
        "Tool-call format is valid enough for Ambient routing without brittle semantic rewriting.",
        "English-only and production-safety limitations are visible in Pi guidance before any user-facing install recommendation.",
      ],
      fallbackGuidance: [
        "Use LiteResearcher-4B for the first local-small deep-research smoke.",
        "Use DR-Venus-4B when checkpoint/GGUF choices and broader search/visit comparisons matter.",
        "Use deterministic web-search plus scraping when production safety matters more than agent autonomy.",
      ],
    },
    bestFor: ["Small-model tool-use research", "Qwen 4B-class search-agent experiments", "DDGS-backed search-agent experiments"],
    tradeoffs: ["Reproduction, English-only, limited training", "Peak performance requires live search backend"],
    avoidWhen: ["The user needs production-ready deep research"],
    platforms: ["linux-x64", "macos-arm64"],
    hardwareFit: ["4B model; tool server/search backend adds runtime complexity"],
    capabilityBuilderDefaults: {
      provider: "Infoseeker-4B Reproduction",
      locality: "either",
      responseFormats: ["text", "json"],
      networkHosts: ["localhost"],
      modelAssets: ["orbit-ai/infoseeker-repro-4b"],
    },
    ambientContract: {
      commandContract: "Wrapper handles <search> and <answer> tool protocol through a bounded local/search tool server.",
      descriptorRequirements: ["model asset declaration", "tool protocol notes", "tool server state notes"],
      artifactPolicy: "Save trace and final answer artifacts for inspection.",
      validationTarget: "Start DDGS/tool server, run one bounded query, and inspect tool-call format.",
    },
    secrets: [],
    networkHosts: ["localhost"],
    modelAssets: [{ name: "orbit-ai/infoseeker-repro-4b", sourceUrl: "https://huggingface.co/orbit-ai/infoseeker-repro-4b", expectedSize: "4B params", licenseNote: "Apache-2.0" }],
    localArtifactReadiness: {
      status: "conditional-local",
      verifiedArtifacts: ["4B weights", "Apache-2.0 license", "tool-format details", "direct Transformers usage", "verl-tool path"],
      missingOrBlockingArtifacts: ["Production safety filtering", "Validated Ambient adapter"],
      minimumLocalSmokeTest: "Run direct inference and a tool-server search path against one fixed question.",
    },
    runtimeState: { externalService: true, serviceKind: "local-daemon", statePaths: ["tool server logs", "model cache"] },
    costPrivacyNotes: ["DDGS-backed live search sends queries to configured search backends."],
    maintenanceNotes: ["Track search backend reliability and tool server setup."],
    safetyBoundaries: ["Keep research-grade; do not promote without safety and quality dogfood."],
    knownQuirks: ["Card states English-only and not intended for production without additional safety filtering."],
    researchStatus: "researched",
    evidence: [{ date: reviewedAt, type: "docs-review", summary: "Enough artifacts exist for conditional local smoke test." }],
    docs: [{ label: "Infoseeker repro model", url: "https://huggingface.co/orbit-ai/infoseeker-repro-4b", lastReviewed: reviewedAt }],
  },
  {
    id: "deep.agentcpm-explore",
    displayName: "AgentCPM-Explore",
    capabilityArea: "deep-research",
    installerShape: "custom-cli",
    providerKind: "hybrid",
    sourceModel: "open-source",
    recommendationTier: "experimental",
    recommendationSummary: "Strong 4B on-device agent candidate with model/GGUF and infrastructure, but tool sandbox setup is advanced.",
    recommendationMemo: {
      deploymentRole: "research",
      recommendation: "Use AgentCPM-Explore when the research question is on-device 4B agent behavior plus AgentDock/MCP-style tool sandboxing; do not choose it for a simple provider install until the tool service lifecycle is dogfooded.",
      dogfoodTargets: [
        "Run the AgentCPM quickstart with a tiny task against explicitly declared model-service and MCP manager URLs.",
        "Save outputs/quickstart_results/dialog.json, tool traces, Docker/AgentDock service logs, model revision, and sandbox capability notes.",
        "Verify the allowed tools are listed before execution and compare the same task with LiteResearcher-4B or DR-Venus-4B.",
      ],
      promotionCriteria: [
        "AgentDock/tool-service lifecycle has start, health, stop, cleanup, and artifact paths that Ambient can manage.",
        "Quickstart dialog and tool traces demonstrate bounded tool use with no undeclared sandbox expansion.",
        "Pi guidance separates model serving, Docker/MCP services, and user approval boundaries for every external capability.",
      ],
      fallbackGuidance: [
        "Use LiteResearcher-4B when search/visit deep research is the main target.",
        "Use DR-Venus-4B when a 4B/GGUF search/visit comparison is desired without AgentDock first.",
        "Use Infoseeker-4B Reproduction for a narrower DDGS/tool-server proof.",
      ],
    },
    bestFor: ["4B local agent research", "Long-horizon benchmark comparison", "MCP/tool sandbox experiments"],
    tradeoffs: ["AgentDock/tool sandbox setup is nontrivial", "Needs Ambient dogfood before recommendation"],
    avoidWhen: ["The user wants a simple provider install"],
    platforms: ["linux-x64", "macos-arm64"],
    hardwareFit: ["4B weights and GGUF help local testing; Docker/eval tooling may need more resources"],
    capabilityBuilderDefaults: {
      provider: "AgentCPM-Explore",
      locality: "either",
      responseFormats: ["text", "json"],
      networkHosts: ["localhost"],
      modelAssets: ["openbmb/AgentCPM-Explore"],
    },
    ambientContract: {
      commandContract: "Wrapper runs bounded tasks through declared MCP/tool service endpoints and saves dialog traces.",
      descriptorRequirements: ["model asset declaration", "tool sandbox state notes", "trace artifact output"],
      artifactPolicy: "Save dialog.json and tool traces by path.",
      validationTarget: "Run quickstart with a tiny task and inspect dialog/tool-call trace.",
    },
    secrets: [],
    networkHosts: ["localhost"],
    modelAssets: [
      { name: "openbmb/AgentCPM-Explore", sourceUrl: "https://huggingface.co/openbmb/AgentCPM-Explore", expectedSize: "4B params", licenseNote: "Apache-2.0" },
      { name: "openbmb/AgentCPM-Explore-GGUF", sourceUrl: "https://huggingface.co/openbmb/AgentCPM-Explore-GGUF", licenseNote: "Apache-2.0" },
    ],
    localArtifactReadiness: {
      status: "conditional-local",
      verifiedArtifacts: ["4B weights", "GGUF", "vLLM/SGLang/Transformers usage", "AgentCPM repo", "Docker-based evaluation/tooling"],
      missingOrBlockingArtifacts: ["Dogfooded AgentDock setup", "Ambient-specific tool adapter"],
      minimumLocalSmokeTest: "Run the AgentCPM quickstart against a tiny task and inspect outputs/quickstart_results/dialog.json.",
    },
    runtimeState: { externalService: true, serviceKind: "docker-compose", statePaths: ["AgentDock services", "outputs/quickstart_results"] },
    costPrivacyNotes: ["Local model possible; external tool endpoints depend on configured sandbox tools."],
    maintenanceNotes: ["Separate model serving from AgentDock/tool service lifecycle."],
    safetyBoundaries: ["Do not let tool sandbox capabilities expand without explicit user approval."],
    knownQuirks: ["Quickstart expects model service and MCP manager URL configuration."],
    researchStatus: "researched",
    evidence: [{ date: reviewedAt, type: "docs-review", summary: "Enough artifacts exist for advanced local smoke testing." }],
    docs: [
      { label: "AgentCPM repo", url: "https://github.com/OpenBMB/AgentCPM", lastReviewed: reviewedAt },
      { label: "AgentCPM-Explore model", url: "https://huggingface.co/openbmb/AgentCPM-Explore", lastReviewed: reviewedAt },
    ],
  },
  {
    id: "vision.minicpm-v",
    displayName: "MiniCPM-V",
    capabilityArea: "visual-understanding",
    installerShape: "vision-analysis-provider",
    providerKind: "local",
    sourceModel: "open-source",
    recommendationTier: "recommended",
    recommendationSummary: "Recommended local visual-evidence provider for scoped macOS arm64 and Linux x64 managed-runtime installs, with MiniCPM-V 4.5 Q4_K_M as the tested screenshot, UI/game-frame, user-image, and sampled-video baseline while GLM remains the primary reasoning model.",
    recommendationMemo: {
      deploymentRole: "primary",
      recommendation: "Use MiniCPM-V 4.5 Q4_K_M as the recommended local visual-understanding provider on scoped macOS arm64 and Linux x64 managed-runtime lanes when the task is to inspect bounded images, screenshots, UI/game frames, or sampled video and return structured evidence for Pi/GLM to reason over.",
      dogfoodTargets: [
        "Keep the Mac llama.cpp/GGUF smoke current with a local screenshot and save model revision, quantization, runtime version, latency, memory footprint, raw output, and schema-validation result.",
        "Keep the same image fixture on the Linux `drone` 24 GB GPU box current with llama.cpp Vulkan/CUDA and compare MiniCPM-V 4.5 against 4.6 before changing defaults.",
        "Ask Ambient/Pi to use the provider against a real Ambient Desktop screenshot and verify Pi cites structured observations without over-claiming or mutating files.",
      ],
      promotionCriteria: [
        "The provider wrapper validates a structured observation schema with summary, observations, confidence, evidence, limitations, and model/runtime metadata.",
        "MiniCPM-V 4.5 GGUF continues to run repeatably through the default managed runtime on macOS arm64 and Linux x64, with Windows x64 smoke evidence required only before Windows support labels.",
        "Input media policy bounds file types, image size, video frame sampling, workspace/outside-workspace reads, and full-output artifact preservation.",
      ],
      fallbackGuidance: [
        "Keep MiniCPM-V 4.6 as an experimental comparison target until its visual evidence quality beats 4.5 on Ambient UI/game fixtures.",
        "Use a user-managed Ollama/vLLM/SGLang endpoint only as an advanced connection mode after endpoint and media-boundary validation.",
        `Use hosted multimodal APIs only after the remote-endpoint security review covers ${miniCpmRemoteEndpointReviewChecklistText()} and the user accepts cloud upload, cost, provider policy, and privacy tradeoffs.`,
      ],
    },
    bestFor: ["Local screenshot analysis", "UI and game visual QA", "OCR-like image inspection", "Multi-image comparison", "Sampled video frame review"],
    tradeoffs: ["4.6 is faster in current Linux GPU smoke but produced more generic visual observations", "Vision output can be plausible but wrong", "Local runtime and model download setup is still more complex than hosted multimodal APIs"],
    avoidWhen: ["The user needs guaranteed visual correctness", "The task requires direct file mutation instead of evidence gathering", "The machine cannot run local model assets or a trusted endpoint"],
    platforms: ["macos-arm64", "macos-x64", "windows-x64", "linux-x64"],
    platformSupport: [
      {
        platform: "macos-arm64",
        status: "supported",
        runtime: "llama.cpp Metal with MiniCPM-V 4.5 Q4_K_M GGUF and f16 vision projector",
        installMode: "Recommended default Ambient-managed macOS arm64 runtime download, with user-approved pinned archives and user-managed llama.cpp runtimes retained as advanced alternatives. Managed installs write into .ambient/vision/minicpm-v/runtime after archive and extracted-binary checksum verification. Desktop removes macOS quarantine from the managed copy only after checksum verification, records signing/Gatekeeper facts in the receipt, and marks the managed copy promotion-eligible when it is quarantine-free with a valid code signature. The manifest/checksum verifier pins llama.cpp b9122 macOS arm64 artifact URLs, archive checksums, and extracted llama-server checksums; pinned b9122 lifecycle smoke now passes on Apple Silicon Metal.",
        evidence: ["Mac llama.cpp 4.5 screenshot smoke", "Pinned b9122 macOS arm64 Metal runtime lifecycle smoke", "Default managed-download macOS arm64 lifecycle smoke with checksum receipt", "Descriptor-backed Ambient CLI package", "Managed local-archive runtime install with checksum receipt", "macOS quarantine removal/signing assessment receipt for app-managed runtime cache", "Live Ambient/Pi ambient_cli screenshot dogfood", "Live Ambient/Pi typed setup/analyze dogfood through default managed runtime download"],
        caveats: ["Recommended macOS support is scoped to Apple Silicon; Intel macOS remains experimental until separate smoke evidence exists.", "Model/projector assets still download through llama.cpp/Hugging Face caches until Ambient-managed model caching is implemented."],
      },
      {
        platform: "linux-x64",
        status: "supported",
        runtime: "llama.cpp Vulkan on Ubuntu with NVIDIA RTX 4090; CUDA path remains acceptable if the installed runtime supports it",
        installMode: "Recommended default Ambient-managed Linux x64 Vulkan runtime download, with user-approved pinned archives and user-managed Linux x64 runtimes retained as advanced alternatives after preflight. Managed installs write into .ambient/vision/minicpm-v/runtime after archive and extracted-binary checksum verification. The manifest/checksum verifier pins llama.cpp b9122 Ubuntu Vulkan x64 artifact URLs, archive checksums, and extracted llama-server checksums; pinned b9122 lifecycle smoke now passes on the `drone` RTX 4090 Vulkan lane while Docker/Podman stays an advanced fallback until lifecycle UX is designed.",
        evidence: ["Linux `drone` RTX 4090 4.5/4.6 quality comparison", "Linux `drone` MiniCPM-V 4.5 runtime lifecycle smoke", "Pinned b9122 Linux x64 Vulkan runtime lifecycle smoke on `drone`", "Default managed-download Linux x64 Vulkan lifecycle smoke on `drone`", "Managed local-archive runtime install with checksum receipt"],
        caveats: ["Recommended Linux support is scoped to the GPU lane validated on `drone`; CPU-only Linux has not been performance-qualified.", "Linux support depends on matching llama.cpp GPU backend, driver, and model-cache state."],
      },
      {
        platform: "macos-x64",
        status: "experimental",
        runtime: "llama.cpp CPU or non-Metal acceleration if available",
        installMode: "User-managed runtime only until an Intel macOS smoke exists.",
        evidence: ["Upstream llama.cpp/GGUF support only"],
        caveats: ["No current Intel macOS validation evidence.", "Expected latency may be poor enough that the provider should not be recommended by default."],
      },
      {
        platform: "windows-x64",
        status: "experimental",
        runtime: "llama.cpp Windows x64 CPU prebuilt binary or WSL advanced fallback",
        installMode: "The blocked manifest now pins the b9122 Windows x64 CPU zip archive and extracted llama-server.exe checksum, and Desktop's managed installer can extract zip archives into .ambient/vision/minicpm-v/runtime. Ambient should not label Windows generally supported until a real Windows smoke covers process lifecycle, path quoting, firewall, and cache behavior.",
        evidence: ["Pinned b9122 Windows x64 CPU zip artifact metadata", "Managed zip runtime archive install path"],
        caveats: ["No real Windows smoke evidence yet.", "Path quoting, local firewall prompts, process cleanup, GPU backend selection, CPU fallback latency, and model-cache paths remain open validation risks."],
      },
    ],
    hardwareFit: ["MiniCPM-V 4.5 Q4_K_M used about 5.3 GiB of RTX 4090 VRAM at 4k context in llama.cpp Vulkan smoke; plan for at least 8 GB VRAM headroom for the baseline. MiniCPM-V 4.6 is lighter and faster but remains quality-experimental."],
    firstPartyTemplate: { available: true, templateId: "vision-analysis-provider:minicpm-v-llamacpp", notes: "Use the bundled ambient-minicpm-v-vision Ambient CLI package as the recommended managed-runtime path on scoped macOS arm64/Linux x64 hosts; explicit runtime sources remain available for advanced endpoints and experimental lanes." },
    capabilityBuilderDefaults: {
      provider: "MiniCPM-V",
      locality: "local",
      outputFileArtifacts: ["json"],
      responseFormats: ["json", "text"],
      networkHosts: ["github.com", "huggingface.co", "ollama.com"],
      modelAssets: ["openbmb/MiniCPM-V-4_5-gguf", "openbmb/MiniCPM-V-4.6 experimental comparison"],
    },
    ambientContract: {
      commandContract: "Vision analyzer accepts bounded image/screenshot/sampled-video inputs plus a task prompt, then returns validated JSON observations and a concise summary for Pi/GLM.",
      descriptorRequirements: ["installerShape vision-analysis-provider", "model asset declarations", "runtime acquisition/cache/preflight contract", "runtime release manifest/checksum verifier", "runtime start/stop/status commands", "input media policy", "structured JSON output schema", "full-output artifact preservation"],
      artifactPolicy: "Persist full raw model output, runtime logs, request metadata, media metadata, and schema-validation results as artifacts; return only bounded structured observations to Pi.",
      validationTarget: "Analyze one checked-in fixture image or local screenshot through the Ambient-mediated provider path and verify valid JSON, non-empty observations, confidence/limitations fields, model/runtime metadata, and no secret/path leakage.",
    },
    secrets: [],
    networkHosts: ["github.com", "huggingface.co", "ollama.com", "localhost"],
    modelAssets: [
      { name: "openbmb/MiniCPM-V-4_5-gguf", sourceUrl: "https://huggingface.co/openbmb/MiniCPM-V-4_5-gguf", expectedSize: "Q4_K_M GGUF tested baseline; text model is about 4.7 GiB and the f16 vision projector is about 1.0 GiB in the llama.cpp cache.", licenseNote: "Apache-2.0 on the Hugging Face model card.", cachePolicy: "Ambient model cache or user-managed runtime cache." },
      { name: "openbmb/MiniCPM-V-4.6", sourceUrl: "https://huggingface.co/openbmb/MiniCPM-V-4.6", expectedSize: "GGUF listed around 2 GB CPU memory; GPU variants listed around 3-4 GB memory. Current Linux smoke is faster but lower quality than 4.5 on Ambient UI fixtures.", licenseNote: "Apache-2.0 per OpenBMB MiniCPM-V repo; confirm exact model-card license for the pinned revision.", cachePolicy: "Ambient model cache or user-managed llama.cpp/Ollama/vLLM/SGLang cache." },
    ],
    localArtifactReadiness: {
      status: "local-ready",
      verifiedArtifacts: ["OpenBMB MiniCPM-V repo", "MiniCPM-V 4.6 framework and model-zoo notes", "MiniCPM-V 4.5 GGUF llama.cpp/Ollama/vLLM/SGLang usage notes", "Apache-2.0 license metadata", "Mac llama.cpp 4.5 screenshot smoke", "Linux `drone` RTX 4090 4.5/4.6 quality comparison", "Descriptor-backed Ambient CLI vision wrapper package", "Runtime acquisition/cache/preflight contract for user-managed llama-server and Ambient-managed download", "Runtime release manifest/checksum verifier with pinned llama.cpp b9122 macOS/Linux archives plus Windows x64 CPU zip and binary checksums", "Default managed runtime download path for pinned macOS arm64/Linux x64 artifacts", "Pinned b9122 macOS/Linux runtime lifecycle smoke with checksum verification and clean shutdown", "Fresh empty-cache default-download lifecycle smoke on Mac and `drone`", "Pinned b9122 Windows x64 CPU zip artifact metadata with archive/binary checksums", "Managed local-archive runtime install with archive/binary checksum receipt and env binding", "Managed zip runtime archive install path", "macOS quarantine removal/signing assessment receipt for app-managed runtime cache", "Live Ambient/Pi ambient_cli MiniCPM-V screenshot dogfood", "Live Ambient/Pi typed setup/analyze dogfood through default managed runtime download"],
      missingOrBlockingArtifacts: ["Windows x64 smoke for Windows support only; not blocking scoped macOS/Linux recommendation"],
      minimumLocalSmokeTest: "Install the pinned managed runtime for macOS arm64 or Linux x64 from an empty cache, verify archive and extracted-binary checksums, analyze one fixture screenshot through the typed Ambient visual tool, and verify valid structured observations plus full artifact preservation.",
    },
    runtimeState: {
      externalService: true,
      serviceKind: "local-daemon",
      statePaths: ["llama.cpp/Ollama/vLLM/SGLang process logs", ".ambient/vision/minicpm-v/runtime Ambient-managed runtime cache", "llama.cpp/Hugging Face model cache", "request/response artifacts", "schema validation artifact"],
      healthCheck: "Runtime acquisition contract, executable preflight, runtime release manifest/checksum verification, model-cache policy, local endpoint liveness, and one tiny fixture-image analysis.",
      updatePolicy: "Pinned model/runtime revisions for dogfood; no automatic runtime or model upgrades.",
    },
    costPrivacyNotes: ["Local analysis avoids image upload after model assets are present; model downloads still contact declared hosts and may consume several GB of disk/network.", `Remote MiniCPM-V endpoints remain disabled until the hosted-endpoint security review covers ${miniCpmRemoteEndpointReviewChecklistText()}.`],
    maintenanceNotes: ["Track MiniCPM-V model revision, quantization, llama.cpp/Ollama/vLLM/SGLang runtime version, runtime acquisition mode, release-manifest/checksum pinning, cache ownership, image preprocessor behavior, prompt/schema examples, and per-platform latency/memory metrics."],
    safetyBoundaries: ["Read-only visual evidence tool; no file mutation; reject unbounded remote URLs; require permission for outside-workspace image reads; report uncertainty instead of rewriting visual conclusions.", `Reject non-local endpointUrl values until the remote-endpoint security review covers ${miniCpmRemoteEndpointReviewChecklistText()}.`],
    knownQuirks: ["MiniCPM-V 4.6 is newly released and may have changing runtime support.", "The 4.5 GGUF path is currently the stronger llama.cpp/Ollama smoke baseline.", "Vision models may miss small UI details, text, or state unless the prompt and image resolution are appropriate.", "llama-server must be shut down after each smoke run; stale processes can hold VRAM and cause misleading insufficient-memory failures."],
    researchStatus: "live-dogfooded",
    evidence: [
      { date: reviewedAt, type: "docs-review", summary: "OpenBMB MiniCPM-V docs reviewed for 4.6 model features, GGUF/runtime support, model-zoo memory notes, 4.5 GGUF llama.cpp commands, and Apache-2.0 licensing metadata." },
      { date: reviewedAt, type: "local-smoke", summary: "Mac llama.cpp and Linux `drone` RTX 4090 smoke tests passed with MiniCPM-V 4.5 Q4_K_M against Ambient screenshots; Linux 4.6 passed but produced more generic observations on the same fixtures. The descriptor-backed Ambient CLI package now starts/stops the local llama-server endpoint and validates structured screenshot output." },
      { date: reviewedAt, type: "pi-live-dogfood", summary: "Ambient/Pi live dogfood installed the MiniCPM-V Ambient CLI package, searched/described it, ran start/analyze/stop through ambient_cli on an Ambient Desktop screenshot, produced valid schema output, and preserved a redacted evidence summary under test-results/minicpm-v/pi-dogfood/." },
      { date: reviewedAt, type: "pi-live-dogfood", summary: "Ambient/Pi typed live dogfood used ambient_visual_minicpm_setup with the default managed runtime download, then ambient_visual_analyze against an Ambient Desktop screenshot; runtime install source, checksums, macOS promotion policy, and redacted visual evidence were preserved under test-results/minicpm-v/pi-dogfood/." },
      { date: reviewedAt, type: "manual-note", summary: "Provider catalog promoted MiniCPM-V to recommended for scoped macOS arm64/Linux x64 managed-runtime installs while keeping macOS x64 and Windows x64 experimental until separate host evidence lands." },
    ],
    docs: [
      { label: "OpenBMB MiniCPM-V repository", url: "https://github.com/OpenBMB/MiniCPM-V", lastReviewed: reviewedAt },
      { label: "MiniCPM-V 4.5 GGUF model card", url: "https://huggingface.co/openbmb/MiniCPM-V-4_5-gguf", lastReviewed: reviewedAt },
      { label: "MiniCPM-V 4.0 GGUF model card", url: "https://huggingface.co/openbmb/MiniCPM-V-4-gguf", lastReviewed: reviewedAt },
      { label: "Ollama MiniCPM-V 4.5", url: "https://ollama.com/openbmb/minicpm-v4.5", lastReviewed: reviewedAt },
      { label: "Ambient MiniCPM-V vision package", url: "resources/ambient-cli-packages/ambient-minicpm-v-vision", lastReviewed: reviewedAt },
    ],
  },
  {
    id: "image.hosted-api-skill-wrapper",
    displayName: "Ambient hosted image API wrapper",
    capabilityArea: "image-generation",
    installerShape: "artifact-generator",
    providerKind: "cloud",
    sourceModel: "mixed",
    recommendationTier: "conditional",
    recommendationSummary: "Thin bundled Ambient CLI package for hosted image APIs including OpenAI, Google Nano Banana Pro, fal/FLUX, Replicate, Stability AI, and Ideogram.",
    recommendationMemo: {
      deploymentRole: "primary",
      recommendation: "Use the bundled ambient-imagegen package as the default hosted image API path: it keeps provider-specific logic as small adapters, uses Ambient-managed secret bindings, and writes durable workspace image artifacts plus metadata.",
      dogfoodTargets: [
        "Install the bundled ambient-imagegen Ambient CLI package, search and describe it through ambient_cli_search and ambient_cli_describe, then run a deterministic fake generation to verify artifact metadata.",
        "Run one low-cost live hosted generation for each configured provider secret over time: OpenAI, Google Nano Banana Pro, fal/FLUX, Replicate, Stability AI, and Ideogram.",
        "Verify each run stores local image bytes, MIME type, dimensions, SHA-256, model id, latency, and env-name-only secret metadata without printing provider keys.",
      ],
      promotionCriteria: [
        "The bundled package installs with passing health checks even when no provider secret is configured.",
        "Pi guidance chooses the wrapper for hosted raster image generation instead of scaffolding bespoke API clients for routine calls.",
        "At least OpenAI and Google Nano Banana Pro have credentialed smoke evidence, with the remaining adapters allowed to stay conditional until keys are available.",
      ],
      fallbackGuidance: [
        "Use ComfyUI local image workflows when local privacy, custom model control, offline generation, or workflow JSON state matters.",
        "Use provider-specific hosted docs only when a requested feature is outside the wrapper's text-to-image artifact contract, such as advanced editing or batch workflows.",
        "Use SVG/rich-document/authored-motion providers when the user asks for editable vectors, documents, or video rather than raster pixels.",
      ],
    },
    bestFor: ["Default hosted image skill", "Google Nano Banana Pro", "OpenAI GPT Image", "fal and FLUX", "Replicate", "Stability AI", "Ideogram"],
    tradeoffs: ["Cloud/API cost", "Provider prompts leave the machine", "Advanced provider-specific editing features may need a later adapter extension"],
    avoidWhen: ["The user requires local/offline generation", "The requested output should be vector/document-native", "The task needs ComfyUI workflow/model control"],
    platforms: ["any"],
    hardwareFit: ["No local acceleration required."],
    firstPartyTemplate: {
      available: true,
      templateId: "ambient-cli:ambient-imagegen",
      notes: "Bundled Ambient CLI package with provider aliases openai, google, google-nano-banana-pro, fal, flux, replicate, stability, and ideogram.",
    },
    capabilityBuilderDefaults: {
      provider: "Ambient hosted image API wrapper",
      locality: "network",
      outputFileArtifacts: ["png", "webp", "jpg"],
      responseFormats: ["json"],
      envNames: ["OPENAI_API_KEY", "GEMINI_API_KEY", "GOOGLE_API_KEY", "FAL_KEY", "REPLICATE_API_TOKEN", "STABILITY_API_KEY", "IDEOGRAM_API_KEY"],
      networkHosts: ["api.openai.com", "generativelanguage.googleapis.com", "fal.run", "api.replicate.com", "api.stability.ai", "api.ideogram.ai"],
    },
    ambientContract: {
      commandContract: "Ambient CLI command hosted_image_generate selects a provider alias, calls the hosted API, stores image bytes in the workspace, and returns bounded artifact metadata.",
      descriptorRequirements: ["installerShape artifact-generator", "ambient-imagegen bundled package", "provider alias", "Ambient-managed secret env binding", "image artifact output"],
      artifactPolicy: "Write generated image artifacts plus sibling metadata JSON to user-visible workspace paths; never leave only temporary remote URLs.",
      validationTarget: "Run hosted_image_generate with AMBIENT_HOSTED_IMAGE_FAKE_GENERATION=1 for deterministic local artifact validation, then run one low-cost credentialed provider smoke when a provider secret is available.",
    },
    secrets: [
      { envName: "OPENAI_API_KEY", required: false, capture: "ambient_cli_secret_request" },
      { envName: "GEMINI_API_KEY", required: false, capture: "ambient_cli_secret_request" },
      { envName: "GOOGLE_API_KEY", required: false, capture: "ambient_cli_secret_request" },
      { envName: "FAL_KEY", required: false, capture: "ambient_cli_secret_request" },
      { envName: "REPLICATE_API_TOKEN", required: false, capture: "ambient_cli_secret_request" },
      { envName: "STABILITY_API_KEY", required: false, capture: "ambient_cli_secret_request" },
      { envName: "IDEOGRAM_API_KEY", required: false, capture: "ambient_cli_secret_request" },
    ],
    networkHosts: ["api.openai.com", "generativelanguage.googleapis.com", "fal.run", "fal.ai", "queue.fal.run", "api.replicate.com", "replicate.delivery", "api.stability.ai", "api.ideogram.ai", "ideogram.ai"],
    modelAssets: [],
    localArtifactReadiness: {
      status: "hosted-reference",
      verifiedArtifacts: ["Bundled Ambient CLI package", "provider alias table", "fake image artifact path", "metadata JSON contract"],
      missingOrBlockingArtifacts: ["Credentialed smoke evidence for every provider adapter"],
      minimumLocalSmokeTest: "Install ambient-imagegen and run hosted_image_generate with AMBIENT_HOSTED_IMAGE_FAKE_GENERATION=1 to verify image bytes, MIME type, dimensions, SHA-256, and metadata.",
    },
    runtimeState: { externalService: true, serviceKind: "hosted-api", statePaths: ["downloaded or decoded image artifact", "sibling metadata JSON"], healthCheck: "hosted_image_doctor --json" },
    costPrivacyNotes: ["Prompts and generated content are sent to the selected hosted provider; usage may incur provider-specific charges."],
    maintenanceNotes: ["Keep provider aliases, default models, endpoint shapes, and response extraction current as hosted APIs change."],
    safetyBoundaries: ["Use Ambient-managed secret binding; never ask users to paste API keys into chat.", "Surface provider policy errors directly; do not rewrite prompts to bypass policy."],
    knownQuirks: ["The wrapper intentionally covers the common text-to-image artifact path first; provider-specific edit/batch modes may need later adapter flags."],
    researchStatus: "researched",
    evidence: [
      { date: reviewedAt, type: "docs-review", summary: "OpenAI, Google Nano Banana, fal, Replicate, Stability AI, and Ideogram hosted image API docs reviewed for a shared thin artifact-generator wrapper shape." },
      { date: reviewedAt, type: "local-smoke", summary: "Bundled ambient-imagegen package includes a deterministic fake generation path for no-secret install/search/describe/artifact validation." },
    ],
    docs: [
      { label: "Ambient hosted image package", url: "resources/ambient-cli-packages/ambient-imagegen", lastReviewed: reviewedAt },
      { label: "Google Gemini image generation", url: "https://ai.google.dev/gemini-api/docs/image-generation", lastReviewed: reviewedAt },
      { label: "OpenAI image generation guide", url: "https://platform.openai.com/docs/guides/image-generation", lastReviewed: reviewedAt },
      { label: "fal image generation tutorial", url: "https://fal.ai/docs/examples/image-generation/generate-images-from-text", lastReviewed: reviewedAt },
      { label: "Replicate predictions guide", url: "https://replicate.com/docs/topics/predictions/create-a-prediction", lastReviewed: reviewedAt },
      { label: "Stability AI API reference", url: "https://platform.stability.ai/docs/api-reference", lastReviewed: reviewedAt },
      { label: "Ideogram generate API", url: "https://developer.ideogram.ai/api-reference/api-reference/generate-v4", lastReviewed: reviewedAt },
    ],
  },
  {
    id: "image.comfyui-local-workflows",
    displayName: "ComfyUI local image workflows",
    capabilityArea: "image-generation",
    installerShape: "artifact-generator",
    providerKind: "local",
    sourceModel: "open-source",
    recommendationTier: "conditional",
    recommendationSummary: "Primary local/open image-generation workflow path once model assets, GPU/Metal fit, and workflow state are explicit.",
    recommendationMemo: {
      deploymentRole: "fallback",
      recommendation: "Use ComfyUI local image workflows when the user wants local model control, privacy, or Stable Diffusion/FLUX-style workflow composition and accepts explicit model downloads, GPU/Metal fit checks, and workflow/runtime state management.",
      dogfoodTargets: [
        "Start ComfyUI or the wrapper daemon, load one tiny checked-in image workflow, and generate a low-step 512x512 PNG from a fixed prompt.",
        "Save workflow JSON, selected model names/paths/checksums, stdout/stderr logs, output image path, image dimensions, byte size, and wall-clock latency.",
        "Exercise missing-model behavior and verify Pi receives a clear model-download/state error instead of attempting output repair.",
      ],
      promotionCriteria: [
        "The installer declares all model assets, cache paths, workflow files, output directories, and local daemon lifecycle commands.",
        "A low-cost smoke test produces a structurally valid image artifact on at least one target workstation class.",
        "Pi guidance clearly distinguishes local privacy/model control from cloud quality, latency, disk, and maintenance tradeoffs.",
      ],
      fallbackGuidance: [
        "Use OpenAI GPT Image API when the user wants the fastest hosted high-quality path and accepts network/API cost.",
        "Use fal Model APIs when the user wants a hosted model marketplace or provider breadth without local GPU setup.",
        "Use rich-document or SVG providers when the requested deliverable is a document, diagram, or vector artifact rather than generated pixels.",
      ],
    },
    bestFor: ["Local image generation", "Stable Diffusion and FLUX workflow composition", "Privacy-sensitive image artifacts"],
    tradeoffs: ["Model downloads and disk use can be large", "Workflow/model compatibility is fragile", "GPU/Metal fit determines practical latency"],
    avoidWhen: ["The user wants the fastest first image with no local setup", "The workstation lacks suitable acceleration or disk space"],
    platforms: ["macos-arm64", "linux-x64", "windows-x64"],
    hardwareFit: ["GPU or Apple Silicon acceleration recommended; CPU-only smoke tests should be tiny"],
    capabilityBuilderDefaults: {
      provider: "ComfyUI",
      locality: "local",
      outputFileArtifacts: ["png", "webp", "jpg"],
      responseFormats: ["json"],
      networkHosts: ["github.com", "huggingface.co", "civitai.com"],
      modelAssets: ["workflow JSON", "checkpoint or diffusion model", "VAE/LoRA/control assets when used"],
    },
    ambientContract: {
      commandContract: "Artifact generator wraps a bounded ComfyUI workflow run and returns output image metadata plus paths to full logs/workflow state.",
      descriptorRequirements: ["installerShape artifact-generator", "model asset declarations", "workflow JSON path", "local daemon lifecycle notes", "image artifact output"],
      artifactPolicy: "Write generated image artifacts plus workflow/log metadata to user-visible workspace paths.",
      validationTarget: "Start or connect to ComfyUI, run one tiny workflow, and verify image bytes, MIME type, dimensions, and model/workflow metadata.",
    },
    secrets: [],
    networkHosts: ["github.com", "huggingface.co", "civitai.com"],
    modelAssets: [{ name: "ComfyUI workflow model assets", licenseNote: "Review each selected model/checkpoint license.", cachePolicy: "Provider model cache; state must be declared before install." }],
    localArtifactReadiness: {
      status: "conditional-local",
      verifiedArtifacts: ["ComfyUI runtime", "workflow JSON support", "local model cache pattern", "image output artifacts"],
      missingOrBlockingArtifacts: ["Selected workflow/model bundle", "Validated Ambient wrapper lifecycle"],
      minimumLocalSmokeTest: "Run a low-step 512x512 image workflow and verify output bytes, MIME type, dimensions, model paths, and logs.",
    },
    runtimeState: { externalService: true, serviceKind: "local-daemon", statePaths: ["ComfyUI model cache", "workflow JSON", "output directory", "daemon logs"], healthCheck: "HTTP API or process liveness check before queueing a workflow." },
    costPrivacyNotes: ["No cloud upload after models are installed; download sources and model licenses still need review."],
    maintenanceNotes: ["Pin workflow JSON, custom nodes, model revisions, and ComfyUI version; local workflows can break after runtime or node updates."],
    safetyBoundaries: ["Do not auto-download unreviewed model assets or custom nodes without explicit user approval."],
    knownQuirks: ["State spans daemon lifecycle, custom nodes, model files, workflow JSON, and output directories."],
    researchStatus: "researched",
    evidence: [{ date: reviewedAt, type: "docs-review", summary: "ComfyUI has official runtime/docs and workflow-oriented image generation primitives suitable for local artifact-generator wrapping." }],
    docs: [
      { label: "ComfyUI repository", url: "https://github.com/comfyanonymous/ComfyUI", lastReviewed: reviewedAt },
      { label: "ComfyUI docs", url: "https://docs.comfy.org/", lastReviewed: reviewedAt },
    ],
  },
  {
    id: "image.fal-model-apis",
    displayName: "fal Model APIs",
    capabilityArea: "image-generation",
    installerShape: "artifact-generator",
    providerKind: "cloud",
    sourceModel: "mixed",
    recommendationTier: "conditional",
    recommendationSummary: "Hosted model API marketplace for image generation when provider breadth matters more than first-party defaulting.",
    recommendationMemo: {
      deploymentRole: "fallback",
      recommendation: "Use fal Model APIs as a hosted image-generation fallback when the user wants access to many image models through one API and accepts cloud cost, queue/job state, model-specific terms, and a FAL_KEY secret.",
      dogfoodTargets: [
        "Run one tiny image-generation request against a pinned fal model with a fixed prompt and low-cost settings.",
        "Save request metadata, selected model id/version, queue/job id if present, output URL or downloaded image path, dimensions, byte size, and latency.",
        "Exercise one model-specific validation failure to confirm Pi sees the provider/model error without leaking the FAL_KEY.",
      ],
      promotionCriteria: [
        "Ambient-managed secret capture stores FAL_KEY without exposing the value to Pi-visible logs or artifacts.",
        "The wrapper pins a model id/version and declares model-specific parameters, output formats, and cost expectations.",
        "Downloaded output images are validated for bytes, MIME type, dimensions, and user-visible artifact path.",
      ],
      fallbackGuidance: [
        "Use OpenAI GPT Image API when the goal is a first-party high-quality hosted default with fewer model-choice decisions.",
        "Use ComfyUI local workflows when privacy, local model control, or offline runs matter more than API convenience.",
        "Use a provider-specific cloud API only when licensing, quality, or latency testing shows it beats the generic fal path.",
      ],
    },
    bestFor: ["Hosted image model breadth", "Fast model API experiments", "Trying newer image models without local GPU setup"],
    tradeoffs: ["Cloud cost and provider/model-specific terms", "Queue/job behavior varies by model", "Output quality depends on selected model"],
    avoidWhen: ["The user needs strict local privacy", "A first-party hosted image path is already sufficient"],
    platforms: ["any"],
    hardwareFit: ["No local acceleration required."],
    capabilityBuilderDefaults: {
      provider: "fal",
      locality: "network",
      outputFileArtifacts: ["png", "webp", "jpg"],
      responseFormats: ["json"],
      envNames: ["FAL_KEY"],
      networkHosts: ["fal.ai", "queue.fal.run"],
    },
    ambientContract: {
      commandContract: "Artifact generator submits a bounded fal image job/request, downloads the output, and returns artifact metadata plus provider job metadata.",
      descriptorRequirements: ["installerShape artifact-generator", "secret env FAL_KEY", "network host declaration", "model id/version declaration", "image artifact output"],
      artifactPolicy: "Download remote image outputs into workspace artifacts; do not leave only transient remote URLs.",
      validationTarget: "Run one low-cost hosted image request and verify image bytes, MIME type, dimensions, model id, and job metadata.",
    },
    secrets: [{ envName: "FAL_KEY", required: true, capture: "ambient_capability_builder_secret_request" }],
    networkHosts: ["fal.ai", "queue.fal.run"],
    modelAssets: [],
    localArtifactReadiness: {
      status: "hosted-reference",
      verifiedArtifacts: ["Model API quickstart", "queue/request API pattern", "client package"],
      missingOrBlockingArtifacts: ["Pinned recommended model list", "Credentialed Ambient wrapper smoke test"],
      minimumLocalSmokeTest: "With FAL_KEY, run one low-cost image model request and validate the downloaded image artifact.",
    },
    runtimeState: { externalService: true, serviceKind: "hosted-api", statePaths: ["provider job id", "downloaded output artifact"], healthCheck: "API request or queue status response." },
    costPrivacyNotes: ["Prompts and generated content leave the machine; model/provider-specific costs and terms must be shown before install."],
    maintenanceNotes: ["Refresh pinned model ids and parameters as fal model endpoints change."],
    safetyBoundaries: ["Respect model/provider content policies and avoid exposing remote output URLs that may include sensitive tokens."],
    knownQuirks: ["Different fal models expose different schemas, queue behavior, and output URL shapes."],
    researchStatus: "researched",
    evidence: [{ date: reviewedAt, type: "docs-review", summary: "fal Model APIs expose client and queue-style hosted inference patterns suitable for cloud artifact-generator wrappers." }],
    docs: [{ label: "fal Model APIs quickstart", url: "https://docs.fal.ai/model-apis/quickstart", lastReviewed: reviewedAt }],
  },
  {
    id: "image.openai-gpt-image",
    displayName: "OpenAI GPT Image API",
    capabilityArea: "image-generation",
    installerShape: "artifact-generator",
    providerKind: "cloud",
    sourceModel: "closed-source",
    recommendationTier: "conditional",
    recommendationSummary: "Primary hosted image-generation and editing candidate when users accept OpenAI API cost, network, and privacy tradeoffs.",
    recommendationMemo: {
      deploymentRole: "primary",
      recommendation: "Use OpenAI GPT Image API as the primary hosted image path when the user wants high-quality image generation or editing quickly and accepts Ambient-managed OPENAI_API_KEY setup, cloud execution, provider policy, and per-request cost.",
      dogfoodTargets: [
        "Run one tiny `gpt-image-2` generation with a fixed prompt and conservative size, then download or decode the output into a workspace image artifact.",
        "Save model, request metadata, output path, byte size, MIME type, dimensions, latency, and any safety/provider error code without logging the OPENAI_API_KEY.",
        "Exercise one edit or invalid-request path later so Pi learns the difference between generation, editing, policy failures, and malformed inputs.",
      ],
      promotionCriteria: [
        "Ambient-managed secret capture stores OPENAI_API_KEY without exposing the value to Pi-visible tool args, logs, descriptors, or artifacts.",
        "The wrapper validates non-empty output bytes, image MIME type, dimensions, and artifact readability before declaring success.",
        "Pi guidance states cost, cloud privacy, provider safety policy, and when to fall back to local ComfyUI.",
      ],
      fallbackGuidance: [
        "Use ComfyUI local workflows when local privacy, custom model control, or offline generation matter more than speed.",
        "Use fal Model APIs when the user wants broader hosted model choice or a non-OpenAI image model.",
        "Use SVG/rich-document providers when the user asks for editable vector or document artifacts instead of pixels.",
      ],
    },
    bestFor: ["Hosted high-quality image generation", "Image editing workflows", "Fast first image support"],
    tradeoffs: ["Cloud/API cost", "Prompts and source images are sent to OpenAI", "Provider safety policy can reject requests"],
    avoidWhen: ["The user requires local/offline generation", "The requested output should be vector/document-native"],
    platforms: ["any"],
    hardwareFit: ["No local acceleration required."],
    capabilityBuilderDefaults: {
      provider: "OpenAI GPT Image",
      locality: "network",
      outputFileArtifacts: ["png", "webp", "jpg"],
      responseFormats: ["json"],
      envNames: ["OPENAI_API_KEY"],
      networkHosts: ["api.openai.com"],
    },
    ambientContract: {
      commandContract: "Artifact generator calls the OpenAI Images API, stores the returned image as a workspace artifact, and returns metadata instead of raw large payloads.",
      descriptorRequirements: ["installerShape artifact-generator", "secret env OPENAI_API_KEY", "network host declaration", "image artifact output", "model id declaration"],
      artifactPolicy: "Write generated or edited image artifacts to user-visible paths; keep only bounded previews in Pi context.",
      validationTarget: "Generate one tiny image through the OpenAI Images API and verify bytes, MIME type, dimensions, model id, and latency.",
    },
    secrets: [{ envName: "OPENAI_API_KEY", required: true, capture: "ambient_capability_builder_secret_request" }],
    networkHosts: ["api.openai.com"],
    modelAssets: [],
    localArtifactReadiness: {
      status: "hosted-reference",
      verifiedArtifacts: ["OpenAI image-generation guide", "Images API reference", "gpt-image-2 model guidance"],
      missingOrBlockingArtifacts: ["Credentialed Ambient wrapper smoke test", "Edit-path validation"],
      minimumLocalSmokeTest: "With OPENAI_API_KEY, run one low-cost `gpt-image-2` image generation and validate the downloaded or decoded artifact.",
    },
    runtimeState: { externalService: true, serviceKind: "hosted-api", statePaths: ["request metadata", "downloaded or decoded image artifact"], healthCheck: "API request response." },
    costPrivacyNotes: ["Cloud-hosted provider; prompts/source images leave the machine and usage may incur API charges."],
    maintenanceNotes: ["Track OpenAI image model/version guidance and output response format changes."],
    safetyBoundaries: ["Surface provider safety/policy errors directly; do not rewrite prompts to bypass policy."],
    knownQuirks: ["Output may arrive as encoded image data or downloadable content depending on API shape and wrapper choices."],
    researchStatus: "researched",
    evidence: [{ date: reviewedAt, type: "docs-review", summary: "OpenAI image-generation docs list GPT Image as the current image-generation/editing API path and `gpt-image-2` as the latest recommended image model." }],
    docs: [
      { label: "OpenAI image generation guide", url: "https://platform.openai.com/docs/guides/image-generation", lastReviewed: reviewedAt },
      { label: "OpenAI Images API reference", url: "https://platform.openai.com/docs/api-reference/images", lastReviewed: reviewedAt },
    ],
  },
  {
    id: "video.comfyui-local-workflows",
    displayName: "ComfyUI local video workflows",
    capabilityArea: "video-generation",
    installerShape: "artifact-generator",
    providerKind: "local",
    sourceModel: "open-source",
    recommendationTier: "conditional",
    recommendationSummary: "First local/open generative-video research path, with explicit workflow, model, codec, and runtime-state caveats.",
    recommendationMemo: {
      deploymentRole: "research",
      recommendation: "Use ComfyUI local video workflows as the first local/open generative-video research path, not as a default one-click install, because video workflows combine large model downloads, GPU/Metal fit, custom nodes, workflow provenance, codecs, and longer runtimes.",
      dogfoodTargets: [
        "Run the smallest viable checked-in ComfyUI video workflow, such as a one-to-two-second low-resolution clip or PNG sequence, with explicit model assets.",
        "Save workflow JSON, model names/paths/checksums, daemon logs, output MP4/WebM/GIF or frame sequence, first-frame preview, ffprobe metadata, byte size, and latency.",
        "Exercise missing-model or codec failure behavior and verify Pi sees declared runtime/model state rather than attempting brittle repair.",
      ],
      promotionCriteria: [
        "Workflow, model assets, custom nodes, codec dependencies, cache paths, and output locations are declared before install.",
        "A tiny workflow produces a playable or structurally valid video artifact with frame count/duration metadata.",
        "Pi guidance separates local/open experimentation from hosted high-quality video APIs and warns about runtime/cost/maintenance.",
      ],
      fallbackGuidance: [
        "Use Runway API or Luma Dream Machine API when the user wants a hosted high-quality video path faster than local model setup.",
        "Use HyperFrames authored-motion video when the output is designed motion graphics, overlays, charts, or HTML-authored scenes.",
        "Use image-generation providers first when the user only needs still assets or video is too costly for the current workstation.",
      ],
    },
    bestFor: ["Local generative-video research", "Workflow-composed video generation", "Model/runtime state inspection"],
    tradeoffs: ["Large model downloads", "High VRAM/GPU/Metal sensitivity", "Codec and custom-node maintenance"],
    avoidWhen: ["The user needs a fast first high-quality video", "The machine cannot support the selected workflow"],
    platforms: ["macos-arm64", "linux-x64", "windows-x64"],
    hardwareFit: ["GPU/Apple Silicon acceleration and substantial disk are usually required; smoke tests must be tiny."],
    capabilityBuilderDefaults: {
      provider: "ComfyUI video workflows",
      locality: "local",
      outputFileArtifacts: ["mp4", "webm", "gif", "png"],
      responseFormats: ["json"],
      networkHosts: ["github.com", "huggingface.co", "civitai.com"],
      modelAssets: ["video workflow JSON", "video model/checkpoint", "codec/runtime dependencies"],
    },
    ambientContract: {
      commandContract: "Artifact generator wraps a bounded ComfyUI video workflow run and returns video artifact metadata plus workflow/model/log paths.",
      descriptorRequirements: ["installerShape artifact-generator", "workflow JSON path", "model asset declarations", "codec dependency notes", "video artifact output"],
      artifactPolicy: "Write video outputs, first-frame previews, ffprobe metadata, workflow JSON, and logs to workspace artifacts.",
      validationTarget: "Run the smallest viable video workflow and verify playable/structural validity, duration/frame metadata, bytes, and model/workflow state.",
    },
    secrets: [],
    networkHosts: ["github.com", "huggingface.co", "civitai.com"],
    modelAssets: [{ name: "ComfyUI video workflow model assets", licenseNote: "Review each selected video model/checkpoint license.", cachePolicy: "Provider model cache; state must be declared before install." }],
    localArtifactReadiness: {
      status: "conditional-local",
      verifiedArtifacts: ["ComfyUI runtime", "video workflow docs/examples", "local model cache pattern", "video/frame output artifacts"],
      missingOrBlockingArtifacts: ["Selected video workflow/model bundle", "Validated Ambient wrapper lifecycle", "Codec dependency dogfood"],
      minimumLocalSmokeTest: "Run a one-to-two-second low-resolution workflow and verify output bytes, duration/frame count, first-frame preview, model paths, and logs.",
    },
    runtimeState: { externalService: true, serviceKind: "local-daemon", statePaths: ["ComfyUI model cache", "workflow JSON", "output directory", "codec/temp files", "daemon logs"], healthCheck: "HTTP API or process liveness check before queueing a workflow." },
    costPrivacyNotes: ["Local generation avoids prompt/media upload after model install, but electricity/runtime and download sources matter."],
    maintenanceNotes: ["Pin ComfyUI, custom nodes, workflow JSON, model revisions, ffmpeg/codec dependencies, and output format expectations."],
    safetyBoundaries: ["Require explicit approval before downloading large models or unreviewed custom nodes."],
    knownQuirks: ["Video workflows are more stateful than image workflows because model, node, codec, and frame-output state all matter."],
    researchStatus: "researched",
    evidence: [{ date: reviewedAt, type: "docs-review", summary: "ComfyUI has local workflow primitives and video workflow documentation suitable for the first local generative-video research card." }],
    docs: [
      { label: "ComfyUI video workflow docs", url: "https://docs.comfy.org/tutorials/video/wan/wan2_2", lastReviewed: reviewedAt },
      { label: "ComfyUI repository", url: "https://github.com/comfyanonymous/ComfyUI", lastReviewed: reviewedAt },
    ],
  },
  {
    id: "video.hyperframes-authored-motion",
    displayName: "HyperFrames authored-motion video",
    capabilityArea: "video-generation",
    installerShape: "artifact-generator",
    providerKind: "local",
    sourceModel: "open-source",
    recommendationTier: "conditional",
    recommendationSummary: "Bundled Ambient CLI path for deterministic HTML/CSS/JS-to-video motion graphics rather than model-generated footage.",
    recommendationMemo: {
      deploymentRole: "fallback",
      recommendation: "Use the bundled ambient-hyperframes Ambient CLI package when the user wants deterministic designed video, animated charts, social overlays, UI demos, or HTML/CSS/JS-authored motion rather than generative footage.",
      dogfoodTargets: [
        "Use ambient_cli_search and ambient_cli_describe to discover ambient-hyperframes through the standard Ambient CLI path.",
        "Run hyperframes_doctor, scaffold one tiny scene, inspect it, render to MP4, and save the source project, command logs, output artifact, first-frame preview, and ffprobe metadata.",
        "Exercise missing-runtime behavior, especially Node.js >= 22, FFmpeg/FFprobe, and browser dependencies, and surface setup errors directly to Pi.",
      ],
      promotionCriteria: [
        "ambient-hyperframes declares Node.js/runtime requirements, source files, render command, output paths, and approval-gated repair guidance in the Ambient CLI descriptor/skill.",
        "Rendered output is playable or structurally valid and includes duration, dimensions, and byte-size metadata.",
        "Pi guidance labels HyperFrames as deterministic authored motion, not an AI video generator.",
      ],
      fallbackGuidance: [
        "Use SVG/CSS when the deliverable should stay as a standalone vector artifact.",
        "Use Remotion when React/TSX video composition is a better fit than HyperFrames' HTML/CSS/JS shape.",
        "Use Runway/Luma/ComfyUI when the user explicitly wants generated footage rather than authored scenes.",
      ],
    },
    bestFor: ["Authored motion graphics", "Animated charts and overlays", "HTML/CSS/JS video scenes"],
    tradeoffs: ["Not a text-to-video model", "Requires authored scene files", "Render/runtime dependencies still need management"],
    avoidWhen: ["The user expects model-generated photorealistic footage"],
    platforms: ["macos-arm64", "macos-x64", "linux-x64", "windows-x64"],
    hardwareFit: ["Node/browser rendering workload; no ML GPU required for simple scenes."],
    capabilityBuilderDefaults: {
      provider: "HyperFrames",
      locality: "local",
      outputFileArtifacts: ["mp4", "webm", "png"],
      responseFormats: ["json"],
      networkHosts: ["github.com", "npmjs.com"],
    },
    firstPartyTemplate: { available: true, templateId: "ambient-cli:ambient-hyperframes", notes: "Use the bundled Ambient CLI package rather than Capability Builder scaffolding or the Scrapling MCP lane." },
    ambientContract: {
      commandContract: "Ambient CLI package ambient-hyperframes exposes doctor, setup-plan, init, inspect, and render commands for declared HyperFrames sources.",
      descriptorRequirements: ["installerShape artifact-generator", "Ambient CLI package ambient-hyperframes", "source project path", "render command", "runtime dependency notes", "video artifact output"],
      artifactPolicy: "Save source files, rendered media, first-frame preview, render logs, and media metadata.",
      validationTarget: "Render one tiny scene through ambient_cli hyperframes_render and verify video bytes, duration, dimensions, and first-frame preview.",
    },
    secrets: [],
    networkHosts: ["github.com", "npmjs.com"],
    modelAssets: [],
    localArtifactReadiness: {
      status: "conditional-local",
      verifiedArtifacts: ["Bundled Ambient CLI adapter", "Open-source repository", "Node.js >= 22 requirement", "render command", "approval-gated setup plan"],
      missingOrBlockingArtifacts: ["Live Pi render dogfood", "Cross-platform real render validation"],
      minimumLocalSmokeTest: "Render a tiny scene with ambient_cli hyperframes_render, save MP4 plus first-frame preview, and verify metadata.",
    },
    runtimeState: { externalService: false, serviceKind: "none", statePaths: ["project source", "render output", "render logs"] },
    costPrivacyNotes: ["Local authored rendering avoids cloud upload unless scene assets reference remote media."],
    maintenanceNotes: ["Track Node.js version, CLI changes, and browser/render dependency requirements."],
    safetyBoundaries: ["Treat user-provided scene code as executable project code and apply workspace trust boundaries."],
    knownQuirks: ["Best positioned as authored-motion video; it should not be conflated with HyperFrames' SVG-animation card."],
    researchStatus: "researched",
    evidence: [{ date: reviewedAt, type: "docs-review", summary: "HyperFrames exposes browser preview and local/Docker render paths for HTML/CSS/JS authored video." }],
    docs: [
      { label: "HyperFrames docs", url: "https://hyperframes.video/docs/getting-started/quickstart", lastReviewed: reviewedAt },
      { label: "HyperFrames CLI", url: "https://hyperframes.app/docs/5-packages/cli", lastReviewed: reviewedAt },
      { label: "HyperFrames repository", url: "https://github.com/heygen-com/hyperframes", lastReviewed: reviewedAt },
    ],
  },
  {
    id: "video.luma-dream-machine-api",
    displayName: "Luma Dream Machine API",
    capabilityArea: "video-generation",
    installerShape: "artifact-generator",
    providerKind: "cloud",
    sourceModel: "closed-source",
    recommendationTier: "conditional",
    recommendationSummary: "Hosted text/image-to-video candidate for credentialed video dogfood with job polling and artifact download.",
    recommendationMemo: {
      deploymentRole: "fallback",
      recommendation: "Use Luma Dream Machine API as a hosted video fallback when the user wants cloud text-to-video or image-to-video and accepts LUMA_API_KEY setup, provider policy, job polling, cost, and remote media handling.",
      dogfoodTargets: [
        "Submit one tiny low-cost video job with a fixed prompt or approved source image, poll until completion, and download the output to a workspace artifact.",
        "Save request metadata, generation/job id, model/settings, output path, byte size, duration/dimensions, first-frame preview, latency, and provider error details.",
        "Exercise one cancellation/failure or invalid-request path so Pi learns Luma job-state and policy-error behavior.",
      ],
      promotionCriteria: [
        "Ambient-managed secret capture stores LUMA_API_KEY without exposing the value to Pi-visible logs, descriptors, artifacts, or tool args.",
        "The wrapper handles job polling, timeout, download, and artifact validation without leaving only remote URLs.",
        "Pi guidance states cloud cost/privacy, provider policy, and when to use Runway, ComfyUI, or HyperFrames instead.",
      ],
      fallbackGuidance: [
        "Use Runway API as the first hosted comparison path when versioned video API behavior or model availability is a better fit.",
        "Use ComfyUI local video workflows for local/open research when hardware and model state are acceptable.",
        "Use HyperFrames for deterministic designed motion graphics.",
      ],
    },
    bestFor: ["Hosted text-to-video", "Hosted image-to-video", "Cloud video API comparison"],
    tradeoffs: ["Cloud cost and privacy", "Job polling and remote media lifecycle", "Provider policy can reject requests"],
    avoidWhen: ["The user requires local/offline generation", "The requested output is authored motion rather than generated footage"],
    platforms: ["any"],
    hardwareFit: ["No local acceleration required."],
    capabilityBuilderDefaults: {
      provider: "Luma Dream Machine",
      locality: "network",
      outputFileArtifacts: ["mp4", "webm", "jpg", "png"],
      responseFormats: ["json"],
      envNames: ["LUMA_API_KEY"],
      networkHosts: ["api.lumalabs.ai", "lumalabs.ai"],
    },
    ambientContract: {
      commandContract: "Artifact generator submits a bounded Luma generation job, polls completion, downloads media outputs, and returns artifact/job metadata.",
      descriptorRequirements: ["installerShape artifact-generator", "secret env LUMA_API_KEY", "network host declaration", "job polling behavior", "video artifact output"],
      artifactPolicy: "Download remote video outputs and first-frame previews into workspace artifacts.",
      validationTarget: "Run one low-cost hosted video job and verify job-state handling, media bytes, duration/dimensions, first-frame preview, and latency.",
    },
    secrets: [{ envName: "LUMA_API_KEY", required: true, capture: "ambient_capability_builder_secret_request" }],
    networkHosts: ["api.lumalabs.ai", "lumalabs.ai"],
    modelAssets: [],
    localArtifactReadiness: {
      status: "hosted-reference",
      verifiedArtifacts: ["Dream Machine API docs", "REST API positioning", "text/image-to-video capability"],
      missingOrBlockingArtifacts: ["Credentialed Ambient wrapper smoke test", "Pinned recommended model/settings"],
      minimumLocalSmokeTest: "With LUMA_API_KEY, submit one tiny video generation, poll completion, download media, and verify metadata.",
    },
    runtimeState: { externalService: true, serviceKind: "hosted-api", statePaths: ["generation/job id", "downloaded media artifact", "first-frame preview"], healthCheck: "API request or job status response." },
    costPrivacyNotes: ["Prompts and source media leave the machine; usage may incur provider charges."],
    maintenanceNotes: ["Track API schema, model/settings availability, output URL lifetime, and policy/error semantics."],
    safetyBoundaries: ["Surface policy errors directly and avoid prompt rewriting to bypass provider rules."],
    knownQuirks: ["Hosted video APIs require polling and output download validation rather than immediate local artifacts."],
    researchStatus: "researched",
    evidence: [{ date: reviewedAt, type: "docs-review", summary: "Luma positions Dream Machine as a REST API for text-to-video, image-to-video, and related generation workflows." }],
    docs: [
      { label: "Luma API", url: "https://lumalabs.ai/api/", lastReviewed: reviewedAt },
      { label: "Luma API docs", url: "https://docs.lumalabs.ai/docs/", lastReviewed: reviewedAt },
    ],
  },
  {
    id: "video.runway-api",
    displayName: "Runway API",
    capabilityArea: "video-generation",
    installerShape: "artifact-generator",
    providerKind: "cloud",
    sourceModel: "closed-source",
    recommendationTier: "conditional",
    recommendationSummary: "Primary hosted video-generation candidate for fast high-quality text/image-to-video dogfood with versioned API behavior.",
    recommendationMemo: {
      deploymentRole: "primary",
      recommendation: "Use Runway API as the first hosted video candidate when the user wants fast high-quality cloud video generation and accepts RUNWAYML_API_SECRET setup, cost, provider policy, and asynchronous job-state handling.",
      dogfoodTargets: [
        "Submit one tiny low-cost text-to-video or image-to-video job through the official SDK/API, poll until completion, and download the output to a workspace artifact.",
        "Save API version, model id/settings, task/job id, output path, byte size, duration/dimensions, first-frame preview, latency, and provider error details.",
        "Exercise one invalid-request or timeout path so Pi guidance includes job-state, polling, and policy/error quirks.",
      ],
      promotionCriteria: [
        "Ambient-managed secret capture stores RUNWAYML_API_SECRET without exposing the value to Pi-visible logs, descriptors, artifacts, or tool args.",
        "The wrapper pins or declares the API version/model, handles polling/downloads/timeouts, and validates media artifacts before success.",
        "Pi guidance states cost/privacy, provider safety policy, and when to fall back to ComfyUI local workflows or HyperFrames.",
      ],
      fallbackGuidance: [
        "Use Luma Dream Machine API as a hosted comparison when Luma quality, model behavior, or pricing fits better.",
        "Use ComfyUI local video workflows when local/open research and model-state inspection matter more than speed.",
        "Use HyperFrames authored-motion video for deterministic graphics, overlays, and chart/video compositions.",
      ],
    },
    bestFor: ["Hosted high-quality video generation", "Text-to-video and image-to-video API dogfood", "Fast first video support"],
    tradeoffs: ["Cloud/API cost", "Prompts/source images leave the machine", "Asynchronous tasks need polling, timeout, and download handling"],
    avoidWhen: ["The user requires local/offline generation", "The requested output is deterministic authored motion"],
    platforms: ["any"],
    hardwareFit: ["No local acceleration required."],
    capabilityBuilderDefaults: {
      provider: "Runway",
      locality: "network",
      outputFileArtifacts: ["mp4", "webm", "jpg", "png"],
      responseFormats: ["json"],
      envNames: ["RUNWAYML_API_SECRET"],
      networkHosts: ["api.dev.runwayml.com"],
    },
    ambientContract: {
      commandContract: "Artifact generator submits a bounded Runway video task, polls completion, downloads media outputs, and returns artifact/task metadata.",
      descriptorRequirements: ["installerShape artifact-generator", "secret env RUNWAYML_API_SECRET", "network host declaration", "API version/model declaration", "video artifact output"],
      artifactPolicy: "Download remote media outputs and first-frame previews into workspace artifacts.",
      validationTarget: "Run one low-cost hosted video task and verify task polling, media bytes, duration/dimensions, first-frame preview, API version, and latency.",
    },
    secrets: [{ envName: "RUNWAYML_API_SECRET", required: true, capture: "ambient_capability_builder_secret_request" }],
    networkHosts: ["api.dev.runwayml.com"],
    modelAssets: [],
    localArtifactReadiness: {
      status: "hosted-reference",
      verifiedArtifacts: ["Runway API setup docs", "official SDK pattern", "API version header behavior", "current video model references"],
      missingOrBlockingArtifacts: ["Credentialed Ambient wrapper smoke test", "Pinned model/settings choice"],
      minimumLocalSmokeTest: "With RUNWAYML_API_SECRET, submit one tiny video task, poll completion, download media, and verify metadata.",
    },
    runtimeState: { externalService: true, serviceKind: "hosted-api", statePaths: ["task/job id", "downloaded media artifact", "first-frame preview"], healthCheck: "API request or task status response." },
    costPrivacyNotes: ["Prompts/source media leave the machine and generation may be expensive; show cost/privacy before install."],
    maintenanceNotes: ["Track X-Runway-Version, SDK/API changes, available models, and output URL lifetimes."],
    safetyBoundaries: ["Surface provider safety/policy errors directly and avoid prompt rewriting to bypass rules."],
    knownQuirks: ["Runway API behavior is versioned; wrappers should declare the API version they target."],
    researchStatus: "researched",
    evidence: [{ date: reviewedAt, type: "docs-review", summary: "Runway setup docs expose SDK/API-key setup and versioned API behavior suitable for hosted video artifact-generator dogfood." }],
    docs: [
      { label: "Runway API setup guide", url: "https://docs.dev.runwayml.com/guides/setup/", lastReviewed: reviewedAt },
      { label: "Runway API docs", url: "https://docs.dev.runwayml.com/", lastReviewed: reviewedAt },
    ],
  },
  {
    id: "video.openai-sora-api",
    displayName: "OpenAI Sora Videos API",
    capabilityArea: "video-generation",
    installerShape: "artifact-generator",
    providerKind: "cloud",
    sourceModel: "closed-source",
    recommendationTier: "research-needed",
    recommendationSummary: "Reserved OpenAI video candidate because the current official Videos API/Sora 2 path is deprecated and scheduled for shutdown.",
    recommendationMemo: {
      deploymentRole: "reserved",
      recommendation: "Reserve OpenAI Sora Videos API for intentional existing-Sora experiments only. Do not make it a new default video provider because the official OpenAI docs mark the Videos API/Sora 2 path as deprecated and scheduled to shut down on September 24, 2026.",
      dogfoodTargets: [
        "Only if explicitly approved, run one tiny hosted video request with OPENAI_API_KEY, save request metadata, output artifact, duration/dimensions, first-frame preview, latency, and deprecation notes.",
        "Verify the wrapper surfaces deprecation/shutdown guidance before credential setup or generation.",
        "Exercise API error handling so Pi can explain whether failures are auth, policy, request-shape, quota, or deprecation related.",
      ],
      promotionCriteria: [
        "Do not promote unless OpenAI publishes a non-deprecated video generation path with clear availability and artifact semantics.",
        "If used before shutdown, Ambient-managed secret capture must protect OPENAI_API_KEY and all outputs must be downloaded/validated as workspace artifacts.",
        "Pi guidance must name the September 24, 2026 shutdown date and recommend Runway/Luma/ComfyUI/HyperFrames alternatives first.",
      ],
      fallbackGuidance: [
        "Use Runway API as the primary hosted video candidate.",
        "Use Luma Dream Machine API as the hosted comparison path.",
        "Use ComfyUI local video workflows or HyperFrames authored-motion video for local/open or deterministic video needs.",
      ],
    },
    bestFor: ["Existing OpenAI video experiments", "Comparing OpenAI video API semantics before shutdown"],
    tradeoffs: ["Deprecated official path", "Cloud/API cost and privacy", "Shutdown risk"],
    avoidWhen: ["Starting a new default video provider", "The user needs a durable provider recommendation"],
    platforms: ["any"],
    hardwareFit: ["No local acceleration required."],
    capabilityBuilderDefaults: {
      provider: "OpenAI Sora Videos",
      locality: "network",
      outputFileArtifacts: ["mp4", "webm", "jpg", "png"],
      responseFormats: ["json"],
      envNames: ["OPENAI_API_KEY"],
      networkHosts: ["api.openai.com"],
    },
    ambientContract: {
      commandContract: "Reserved artifact generator would call the OpenAI Videos API only for explicitly approved experiments and must surface deprecation status.",
      descriptorRequirements: ["installerShape artifact-generator", "secret env OPENAI_API_KEY", "network host declaration", "deprecation warning", "video artifact output"],
      artifactPolicy: "Download any remote media outputs into workspace artifacts and include deprecation metadata.",
      validationTarget: "Later phase only: verify official non-deprecated availability before any production wrapper; current path is reserved due to September 24, 2026 shutdown.",
    },
    secrets: [{ envName: "OPENAI_API_KEY", required: true, capture: "ambient_capability_builder_secret_request" }],
    networkHosts: ["api.openai.com"],
    modelAssets: [],
    localArtifactReadiness: {
      status: "hosted-reference",
      verifiedArtifacts: ["OpenAI video-generation guide", "Videos API reference", "deprecation/shutdown notice"],
      missingOrBlockingArtifacts: ["Non-deprecated OpenAI video provider path", "Credentialed Ambient wrapper smoke test"],
      minimumLocalSmokeTest: "Do not run as a default install; first verify a non-deprecated OpenAI video path or run an explicitly approved experiment before September 24, 2026.",
    },
    runtimeState: { externalService: true, serviceKind: "hosted-api", statePaths: ["request/task id", "downloaded media artifact", "deprecation metadata"], healthCheck: "API availability check only after explicit approval." },
    costPrivacyNotes: ["Cloud-hosted provider; prompts/source media leave the machine and may incur API charges."],
    maintenanceNotes: ["Track OpenAI video docs for a replacement path after the deprecated Videos API/Sora 2 shutdown."],
    safetyBoundaries: ["Do not route users to a deprecated provider without explicit approval and current docs review."],
    knownQuirks: ["Official docs reviewed for this slice state the Videos API and Sora 2 are deprecated and shut down on September 24, 2026."],
    researchStatus: "deprecated",
    evidence: [{ date: reviewedAt, type: "docs-review", summary: "Official OpenAI video docs mark the current Videos API/Sora 2 path deprecated with a September 24, 2026 shutdown date." }],
    docs: [
      { label: "OpenAI video generation guide", url: "https://platform.openai.com/docs/guides/video-generation", lastReviewed: reviewedAt },
      { label: "OpenAI Videos API reference", url: "https://platform.openai.com/docs/api-reference/videos", lastReviewed: reviewedAt },
    ],
  },
  {
    id: "rich-documents.ambient-artifact-runtimes",
    displayName: "Ambient Documents/Presentations/Spreadsheets runtimes",
    capabilityArea: "rich-documents",
    installerShape: "artifact-generator",
    providerKind: "built-in",
    sourceModel: "ambient-built-in",
    recommendationTier: "recommended",
    recommendationSummary: "Primary local artifact-generation path for `.docx`, `.pptx`, and `.xlsx` when the user wants files in the workspace.",
    recommendationMemo: {
      deploymentRole: "primary",
      recommendation: "Use the Ambient Documents, Presentations, and Spreadsheets runtimes as the primary local rich-document path when the user wants workspace files such as `.docx`, `.pptx`, or `.xlsx` with render/readback verification.",
      dogfoodTargets: [
        "Create one tiny `.docx`, `.pptx`, and `.xlsx` artifact through the built-in runtimes, then verify each by reading it back through the workspace file surface.",
        "For Word and PowerPoint outputs, render or preview the result where available and record artifact path, file size, page/slide/sheet count, and visual/readback notes.",
        "Exercise failure reporting by asking Pi for an unsupported rich-document operation and checking that it asks for the concrete file/task type instead of guessing a generic install.",
      ],
      promotionCriteria: [
        "Local artifact generation produces non-empty files with stable paths and bounded previews for Pi.",
        "Render/readback verification catches malformed Word, PowerPoint, and spreadsheet outputs before the task is considered complete.",
        "Pi guidance makes this the default for local files and does not route users to cloud connectors unless they ask for native collaboration.",
      ],
      fallbackGuidance: [
        "Use Ambient Office extraction/preview when the task is reading, summarizing, or converting existing Office files.",
        "Use Google Workspace when the target is a native Google Doc, Sheet, or Slide with collaboration.",
        "Use local OOXML libraries only for custom generators that the built-in runtimes cannot express yet.",
      ],
    },
    bestFor: ["Local Word/PPTX/XLSX artifact generation", "Workspace-visible document outputs", "Render-and-readback verification"],
    tradeoffs: ["Local artifacts are not cloud-collaborative by default", "Advanced Office layout fidelity depends on the specific runtime and preview path"],
    avoidWhen: ["The user explicitly wants a native Google Doc/Sheet/Slide or Microsoft 365 collaborative document"],
    platforms: ["macos-arm64", "macos-x64", "linux-x64"],
    hardwareFit: ["CPU-friendly for small and medium documents; large rendered decks/workbooks need bounded preview checks"],
    firstPartyTemplate: { available: true, templateId: "ambient-rich-documents:local-artifact-runtimes", notes: "Use installed Documents, Presentations, and Spreadsheets runtime skills before custom packages." },
    capabilityBuilderDefaults: {
      provider: "Ambient rich-document runtimes",
      locality: "local",
      outputFileArtifacts: ["docx", "pptx", "xlsx", "pdf", "png"],
      responseFormats: ["json"],
    },
    ambientContract: {
      commandContract: "Artifact generator writes declared `.docx`, `.pptx`, or `.xlsx` workspace files and returns artifact metadata plus verification notes.",
      descriptorRequirements: ["artifact-generator shape", "declared output file artifacts", "render/readback verification notes", "bounded preview metadata"],
      artifactPolicy: "Write generated files to user-visible workspace paths and store any render previews or screenshots as explicit artifacts.",
      validationTarget: "Generate tiny DOCX, PPTX, and XLSX files, then read back or render enough of each artifact to verify structure and content.",
    },
    secrets: [],
    networkHosts: [],
    modelAssets: [],
    localArtifactReadiness: {
      status: "local-ready",
      verifiedArtifacts: ["Documents runtime skill", "Presentations runtime skill", "Spreadsheets runtime skill", "workspace artifact readback path"],
      missingOrBlockingArtifacts: ["Unified first-party provider installer card for all rich-document runtimes"],
      minimumLocalSmokeTest: "Generate one tiny DOCX/PPTX/XLSX artifact and verify it through workspace readback/rendering.",
    },
    runtimeState: { externalService: false, serviceKind: "none", statePaths: ["workspace artifact paths", "render preview artifacts"] },
    costPrivacyNotes: ["Local files remain in the workspace unless the user asks to upload or share them."],
    maintenanceNotes: ["Track runtime plugin versions, renderer availability, supported output formats, and readback/render proof requirements."],
    safetyBoundaries: ["Do not upload generated documents to cloud services unless the user explicitly asks for a cloud-native or shared artifact."],
    knownQuirks: ["Generated document quality depends on template/layout support and must be verified visually or by structured readback."],
    researchStatus: "live-dogfooded",
    evidence: [
      { date: reviewedAt, type: "manual-note", summary: "Documents, Presentations, and Spreadsheets runtime skills are installed in this Codex/Ambient environment." },
      { date: reviewedAt, type: "local-smoke", summary: "Existing Office and runtime tests cover workspace artifact handling, Office extraction, and rich artifact file extensions." },
    ],
    docs: [
      { label: "Documents runtime skill", url: "plugin://documents", lastReviewed: reviewedAt },
      { label: "Presentations runtime skill", url: "plugin://presentations", lastReviewed: reviewedAt },
      { label: "Spreadsheets runtime skill", url: "plugin://spreadsheets", lastReviewed: reviewedAt },
      { label: "Office parsing and previewing plan", url: "officeParsingAndPreviewing.md", lastReviewed: reviewedAt },
    ],
  },
  {
    id: "rich-documents.ambient-office-extraction-preview",
    displayName: "Ambient Office extraction/preview",
    capabilityArea: "rich-documents",
    installerShape: "file-converter",
    providerKind: "built-in",
    sourceModel: "ambient-built-in",
    recommendationTier: "recommended",
    recommendationSummary: "Primary local path for reading PDFs plus `.docx`, `.pptx`, and `.xlsx`, with LibreOffice-backed previews when a renderer is available.",
    recommendationMemo: {
      deploymentRole: "primary",
      recommendation: "Use Ambient PDF/Office extraction and preview as the primary rich-document reading and conversion path for existing local files: native text extraction covers PDFs with extractable text plus `.docx`, `.pptx`, and `.xlsx`, while LibreOffice preview handles Office-to-PDF rendering when available.",
      dogfoodTargets: [
        "Run a local extraction fixture for `.pdf` through native read, `file_read`, or `long_context_process` and verify page count, truncation, and extracted text metadata.",
        "Run local extraction fixtures for `.docx`, `.pptx`, and `.xlsx` through `file_read` or `long_context_process` and verify format, unit count, truncation, and extracted text metadata.",
        "Run the LibreOffice preview path with both missing-renderer and renderer-available cases so Pi can surface clear setup guidance.",
        "Use at least one real or fixture deck/workbook with speaker notes or multiple sheets to verify ordering and bounded output behavior.",
      ],
      promotionCriteria: [
        "Extraction returns text and metadata without exposing raw OOXML package bytes.",
        "LibreOffice preview failures are explicit as missing-renderer or failed conversion rather than blocking text extraction.",
        "Pi guidance distinguishes supported modern Office text extraction from legacy `.doc`, `.ppt`, and `.xls` preview-only behavior.",
      ],
      fallbackGuidance: [
        "Use Ambient local artifact runtimes when the user wants to create new rich-document files.",
        "Use LibreOffice/Pandoc conversion when a format conversion is needed outside the built-in extraction path.",
        "Use Google Workspace export when the source is a native Google Doc/Sheet/Slide rather than a local Office file.",
      ],
    },
    bestFor: ["PDF text extraction", "Office file reading", "DOCX/PPTX/XLSX extraction", "PDF previews", "Long-context document QA"],
    tradeoffs: ["Visual preview requires LibreOffice discovery", "Legacy `.doc`, `.ppt`, and `.xls` are preview-only, not text-extraction-ready"],
    avoidWhen: ["The user needs to create a new native cloud document instead of reading or previewing a local file"],
    platforms: ["macos-arm64", "macos-x64", "linux-x64"],
    hardwareFit: ["Native text extraction is lightweight; preview conversion cost depends on LibreOffice and file size"],
    firstPartyTemplate: { available: true, templateId: "ambient-rich-documents:office-extraction-preview", notes: "Use existing file_read, native read, and long_context_process contracts before adding new tools." },
    capabilityBuilderDefaults: {
      provider: "Ambient Office extraction/preview",
      locality: "local",
      outputFileArtifacts: ["pdf", "txt", "json"],
      responseFormats: ["text", "json"],
    },
    ambientContract: {
      commandContract: "Converter/extractor returns bounded text and metadata for PDFs and supported Office files and writes preview PDFs only when conversion is requested.",
      descriptorRequirements: ["file-converter shape", "supported format list including PDF", "bounded extraction metadata", "LibreOffice renderer status"],
      artifactPolicy: "Return bounded extracted text to Pi; persist full previews and conversion outputs by path.",
      validationTarget: "Extract DOCX/PPTX/XLSX fixture text, exercise too-large/unsupported failures, and render a PDF preview through LibreOffice or return missing-renderer.",
    },
    secrets: [],
    networkHosts: [],
    modelAssets: [],
    localArtifactReadiness: {
      status: "local-ready",
      verifiedArtifacts: ["pdfTextExtraction service", "officeTextExtraction service", "OfficePreviewService", "file_read integration", "long_context_process document input path"],
      missingOrBlockingArtifacts: ["Installed LibreOffice for visual preview on hosts where it is not discoverable"],
      minimumLocalSmokeTest: "Extract PDF/DOCX/PPTX/XLSX fixtures and run preview conversion with missing-renderer and renderer-available paths.",
    },
    runtimeState: { externalService: false, serviceKind: "none", statePaths: [".ambient-office-preview cache", "workspace file metadata"] },
    costPrivacyNotes: ["Local extraction avoids cloud upload; preview conversion runs locally through LibreOffice when installed."],
    maintenanceNotes: ["Track file-size limits, zip-entry limits, LibreOffice discovery, renderer version, cache invalidation, and legacy-format handling."],
    safetyBoundaries: ["Treat Office files as untrusted: keep size limits, conversion timeouts, and bounded extracted output."],
    knownQuirks: ["Text extraction and visual preview are intentionally separate; a missing renderer should not block text extraction."],
    researchStatus: "live-dogfooded",
    evidence: [
      { date: reviewedAt, type: "local-smoke", summary: "Unit coverage verifies DOCX/PPTX/XLSX extraction, too-large handling, corrupt files, and LibreOffice preview success/missing-renderer paths." },
      { date: reviewedAt, type: "manual-note", summary: "Office parsing and previewing plan documents current support and legacy limitations." },
    ],
    docs: [
      { label: "Office parsing and previewing plan", url: "officeParsingAndPreviewing.md", lastReviewed: reviewedAt },
      { label: "LibreOffice command-line parameters", url: "https://help.libreoffice.org/latest/en-US/text/shared/guide/start_parameters.html", lastReviewed: reviewedAt },
      { label: "LibreOffice PDF export parameters", url: "https://help.libreoffice.org/latest/en-US/text/shared/guide/pdf_params.html", lastReviewed: reviewedAt },
    ],
  },
  {
    id: "rich-documents.google-workspace",
    displayName: "Google Workspace Docs/Sheets/Slides",
    capabilityArea: "rich-documents",
    installerShape: "connector",
    providerKind: "cloud",
    sourceModel: "closed-source",
    recommendationTier: "conditional",
    recommendationSummary: "Cloud-native collaborative document path for Google Docs, Sheets, and Slides when the user wants shared Google Workspace artifacts.",
    recommendationMemo: {
      deploymentRole: "fallback",
      recommendation: "Use Google Workspace when the target artifact should be a native collaborative Google Doc, Sheet, or Slide rather than a local Office file; keep OAuth scopes, export formats, and cloud sharing explicit.",
      dogfoodTargets: [
        "Create or modify one tiny native Google Doc, Sheet, and Slide through the approved Google Workspace connector path when credentials are available.",
        "Export one selected Google Workspace file through Drive export to text or PDF and verify the connector readback path.",
        "Record OAuth scopes, file id, sharing state, export MIME type, API method ids, and latency/error shapes without exposing tokens.",
      ],
      promotionCriteria: [
        "Credentialed connector dogfood can create/read/export native Google Workspace files through Ambient-managed OAuth.",
        "Pi guidance chooses Google Workspace only for cloud-native collaboration, Drive organization, or user-requested sharing.",
        "Export/readback paths are deterministic enough that Pi can verify content without relying on browser scraping.",
      ],
      fallbackGuidance: [
        "Use Ambient local artifact runtimes for local `.docx`, `.pptx`, or `.xlsx` deliverables.",
        "Use Ambient Office extraction/preview for existing local Office files.",
        "Use Microsoft 365/Graph only when the user or organization specifically requires Microsoft cloud storage/workflows.",
      ],
    },
    bestFor: ["Native Google Docs", "Native Google Sheets", "Native Google Slides", "Collaborative cloud documents", "Drive export workflows"],
    tradeoffs: ["Requires Google OAuth and network access", "Native Google document structures differ from local Office artifacts"],
    avoidWhen: ["The user needs offline/local-only document generation", "The user wants a local `.docx`, `.pptx`, or `.xlsx` file without cloud upload"],
    platforms: ["any"],
    hardwareFit: ["Hosted API path; local hardware is not the bottleneck"],
    capabilityBuilderDefaults: {
      provider: "Google Workspace",
      locality: "network",
      responseFormats: ["json", "text"],
      networkHosts: ["docs.googleapis.com", "slides.googleapis.com", "sheets.googleapis.com", "www.googleapis.com"],
    },
    ambientContract: {
      commandContract: "Connector calls explicit Google Docs/Sheets/Slides/Drive methods and returns file ids, URLs, export metadata, and bounded content previews.",
      descriptorRequirements: ["connector shape", "OAuth scope notes", "Google API method declarations", "export/readback validation"],
      artifactPolicy: "Do not persist OAuth tokens in artifacts; write exported files only when the user requests local copies.",
      validationTarget: "Create or export a tiny native Google Workspace document and verify content through connector readback.",
    },
    secrets: [],
    networkHosts: ["docs.googleapis.com", "slides.googleapis.com", "sheets.googleapis.com", "www.googleapis.com"],
    modelAssets: [],
    runtimeState: { externalService: true, serviceKind: "hosted-api", statePaths: ["Google sidecar OAuth/account state"] },
    costPrivacyNotes: ["Document content, metadata, and sharing state live in Google Workspace under the connected account."],
    maintenanceNotes: ["Track OAuth scopes, sidecar method catalog, Drive export MIME support, API quota/rate limits, and account switching behavior."],
    safetyBoundaries: ["Do not create, share, or overwrite cloud documents without explicit user intent and scoped connector authorization."],
    knownQuirks: ["Drive export is often the safer readback fallback for Google Docs text when Docs API read methods are unavailable in a local OAuth project."],
    researchStatus: "researched",
    evidence: [
      { date: reviewedAt, type: "docs-review", summary: "Google Docs, Slides, Sheets, and Drive export APIs expose create/export paths for cloud-native rich documents." },
      { date: reviewedAt, type: "manual-note", summary: "Ambient has Google Workspace sidecar and method-broker coverage for Drive/Docs/Sheets/Slides workflows." },
    ],
    docs: [
      { label: "Google Docs documents.create", url: "https://developers.google.com/workspace/docs/api/reference/rest/v1/documents/create", lastReviewed: reviewedAt },
      { label: "Google Slides presentations.create", url: "https://developers.google.com/workspace/slides/api/reference/rest/v1/presentations/create", lastReviewed: reviewedAt },
      { label: "Google Sheets spreadsheets.create", url: "https://developers.google.com/sheets/api/reference/rest/v4/spreadsheets/create", lastReviewed: reviewedAt },
      { label: "Google Drive download/export guide", url: "https://developers.google.com/workspace/drive/api/guides/manage-downloads", lastReviewed: reviewedAt },
    ],
  },
  {
    id: "rich-documents.local-conversion-ooxml",
    displayName: "LibreOffice/Pandoc/OOXML libraries",
    capabilityArea: "rich-documents",
    installerShape: "file-converter",
    providerKind: "local",
    sourceModel: "open-source",
    recommendationTier: "conditional",
    recommendationSummary: "Local fallback stack for conversions and custom Word/PowerPoint generators when built-in Ambient runtimes are not enough.",
    recommendationMemo: {
      deploymentRole: "fallback",
      recommendation: "Use LibreOffice, Pandoc, Mammoth, python-docx, docx, or PptxGenJS as a local fallback stack for explicit conversion or custom OOXML generation tasks that the built-in Ambient runtimes cannot cover.",
      dogfoodTargets: [
        "Run one tiny conversion through Pandoc or LibreOffice and verify the output file exists, opens through Ambient Office extraction/preview, and records the exact command/version.",
        "Generate one tiny `.docx` with a JS or Python OOXML library and one tiny `.pptx` with PptxGenJS, then read or preview both artifacts.",
        "Exercise unsupported-format and missing-binary failures so Pi can recommend a narrower built-in path before installing packages.",
      ],
      promotionCriteria: [
        "Each wrapper declares the exact binary/package versions, input/output formats, and workspace artifact paths.",
        "Generated DOCX/PPTX files pass Ambient extraction or preview validation without silent repair.",
        "Pi guidance recommends this stack only for concrete conversion/custom-generator tasks, not as the default rich-document path.",
      ],
      fallbackGuidance: [
        "Use Ambient local artifact runtimes first for normal Word/PowerPoint/spreadsheet creation.",
        "Use Ambient Office extraction/preview first for reading existing Office files.",
        "Use Google Workspace when the user wants native cloud collaboration rather than local files.",
      ],
    },
    bestFor: ["Explicit format conversion", "Custom OOXML generation", "Markdown-to-DOCX/PPTX", "DOCX-to-HTML extraction"],
    tradeoffs: ["Dependency and fidelity risks vary by library", "LibreOffice conversion can be slow and host-dependent", "Custom OOXML generation needs visual verification"],
    avoidWhen: ["A built-in Ambient runtime can produce the required artifact directly", "The user has not specified an input/output format"],
    platforms: ["macos-arm64", "macos-x64", "windows-x64", "linux-x64"],
    hardwareFit: ["CPU-friendly for small files; LibreOffice conversion can be heavy for large decks/workbooks"],
    capabilityBuilderDefaults: {
      provider: "Local document conversion/OOXML stack",
      locality: "local",
      outputFileArtifacts: ["docx", "pptx", "xlsx", "pdf", "html", "md"],
      responseFormats: ["json", "text"],
      modelAssets: ["LibreOffice/soffice binary", "Pandoc binary", "OOXML package dependencies"],
    },
    ambientContract: {
      commandContract: "Wrapper performs one explicit conversion or generation operation and returns input/output paths, versions, and validation proof.",
      descriptorRequirements: ["file-converter shape", "input/output format declaration", "binary/package version notes", "artifact validation proof"],
      artifactPolicy: "Write converted/generated files to workspace paths and keep full conversion logs as artifacts when output is large.",
      validationTarget: "Convert or generate a tiny DOCX/PPTX/PDF artifact and verify it through Ambient readback or preview.",
    },
    secrets: [],
    networkHosts: [],
    modelAssets: [
      { name: "LibreOffice/soffice", sourceUrl: "https://help.libreoffice.org/latest/en-US/text/shared/guide/start_parameters.html", cachePolicy: "System install or managed binary path." },
      { name: "Pandoc", sourceUrl: "https://pandoc.org/MANUAL.html", cachePolicy: "System install or managed binary path." },
      { name: "Mammoth", sourceUrl: "https://github.com/mwilliamson/mammoth.js", licenseNote: "BSD-2-Clause" },
      { name: "python-docx", sourceUrl: "https://python-docx.readthedocs.io/en/latest/user/documents.html", licenseNote: "MIT" },
      { name: "docx", sourceUrl: "https://www.npmjs.com/package/docx" },
      { name: "PptxGenJS", sourceUrl: "https://gitbrent.github.io/PptxGenJS/", licenseNote: "MIT" },
    ],
    localArtifactReadiness: {
      status: "conditional-local",
      verifiedArtifacts: ["official LibreOffice CLI docs", "Pandoc manual", "Mammoth repo", "python-docx docs", "docx npm package", "PptxGenJS docs"],
      missingOrBlockingArtifacts: ["Ambient-approved typed installer for each library/binary", "format-specific fidelity matrix", "cross-platform binary discovery"],
      minimumLocalSmokeTest: "Run one tiny conversion/generation and verify output through Ambient Office readback or preview.",
    },
    runtimeState: { externalService: false, serviceKind: "none", statePaths: ["workspace conversion outputs", "tool/package cache"] },
    costPrivacyNotes: ["Local conversions avoid cloud upload but may install binaries or packages into a managed environment."],
    maintenanceNotes: ["Pin versions, format support, binary discovery paths, conversion timeouts, and fidelity caveats per tool."],
    safetyBoundaries: ["Do not run macros or active content from untrusted Office files; treat conversion inputs as untrusted."],
    knownQuirks: ["Pandoc is excellent for structured Markdown-to-DOCX/PPTX but not pixel-perfect Office round-tripping.", "Mammoth favors semantic HTML over exact visual style preservation.", "PptxGenJS can generate rich decks but still needs visual QA."],
    researchStatus: "researched",
    evidence: [{ date: reviewedAt, type: "docs-review", summary: "Official/project docs reviewed for LibreOffice CLI parameters, Pandoc DOCX/PPTX support, Mammoth, python-docx, docx, and PptxGenJS." }],
    docs: [
      { label: "LibreOffice command-line parameters", url: "https://help.libreoffice.org/latest/en-US/text/shared/guide/start_parameters.html", lastReviewed: reviewedAt },
      { label: "Pandoc manual", url: "https://pandoc.org/MANUAL.html", lastReviewed: reviewedAt },
      { label: "Mammoth", url: "https://github.com/mwilliamson/mammoth.js", lastReviewed: reviewedAt },
      { label: "python-docx", url: "https://python-docx.readthedocs.io/en/latest/user/documents.html", lastReviewed: reviewedAt },
      { label: "docx npm package", url: "https://www.npmjs.com/package/docx", lastReviewed: reviewedAt },
      { label: "PptxGenJS", url: "https://gitbrent.github.io/PptxGenJS/", lastReviewed: reviewedAt },
    ],
  },
  {
    id: "rich-documents.microsoft-365-graph",
    displayName: "Microsoft 365 / Graph document workflows",
    capabilityArea: "rich-documents",
    installerShape: "connector",
    providerKind: "cloud",
    sourceModel: "closed-source",
    recommendationTier: "research-needed",
    recommendationSummary: "Reserved enterprise cloud path for OneDrive, SharePoint, and Excel workbook workflows; not a V1 default document generator.",
    recommendationMemo: {
      deploymentRole: "reserved",
      recommendation: "Use Microsoft 365 / Graph as a reserved enterprise connector candidate when the user specifically needs OneDrive, SharePoint, or Excel workbook workflows; do not treat it as the default Word/PowerPoint authoring provider until scoped connector dogfood exists.",
      dogfoodTargets: [
        "With approved Microsoft account auth, upload one tiny generated Office file to OneDrive or SharePoint and read back its DriveItem metadata.",
        "Run one tiny Excel workbook API operation for a workbook stored in OneDrive/SharePoint and record scopes, file id, range address, and response shape.",
        "Document which Word/PowerPoint tasks are file-storage/upload flows versus native document-editing APIs before recommending any install path.",
      ],
      promotionCriteria: [
        "Ambient has an approved Microsoft OAuth/connector flow with scoped permissions, account switching, and audit events.",
        "DriveItem upload/readback and at least one Excel workbook operation are credential-dogfooded without token leakage.",
        "Pi guidance clearly separates Microsoft cloud storage/workbook automation from local Office artifact generation.",
      ],
      fallbackGuidance: [
        "Use Ambient local artifact runtimes for local Word/PowerPoint/spreadsheet files.",
        "Use Google Workspace for cloud-native Docs/Sheets/Slides collaboration when Microsoft is not required.",
        "Use local conversion/OOXML libraries when the task is file conversion or custom local generation.",
      ],
    },
    bestFor: ["Enterprise Microsoft 365 workflows", "OneDrive and SharePoint file storage", "Excel workbook automation", "Organization-scoped document workflows"],
    tradeoffs: ["Requires Microsoft OAuth/admin policy and scoped permissions", "Word/PowerPoint authoring is not the same as file upload/storage", "Enterprise tenant policy can block connector behavior"],
    avoidWhen: ["The user just needs a local `.docx` or `.pptx` artifact", "No Microsoft account/tenant requirement exists"],
    platforms: ["any"],
    hardwareFit: ["Hosted API path; local hardware is not the bottleneck"],
    capabilityBuilderDefaults: {
      provider: "Microsoft 365 / Graph",
      locality: "network",
      responseFormats: ["json"],
      networkHosts: ["graph.microsoft.com"],
    },
    ambientContract: {
      commandContract: "Connector calls explicit Microsoft Graph endpoints for DriveItem files or workbook operations and returns ids, URLs, scopes, and bounded previews.",
      descriptorRequirements: ["connector shape", "OAuth scope notes", "Graph endpoint declarations", "tenant/admin-policy notes"],
      artifactPolicy: "Do not persist OAuth tokens in artifacts; write downloaded/exported files only when requested.",
      validationTarget: "Upload a tiny file to OneDrive/SharePoint or run one Excel workbook operation through approved Microsoft Graph auth.",
    },
    secrets: [],
    networkHosts: ["graph.microsoft.com"],
    modelAssets: [],
    runtimeState: { externalService: true, serviceKind: "hosted-api", statePaths: ["future Microsoft connector OAuth/account state"] },
    costPrivacyNotes: ["Document content and metadata live in Microsoft 365 under the connected tenant/account."],
    maintenanceNotes: ["Track Graph API version, OAuth scopes, tenant/admin consent, DriveItem upload limits, Excel workbook API limits, and throttling behavior."],
    safetyBoundaries: ["Do not upload, share, or modify enterprise documents without explicit user intent and scoped account authorization."],
    knownQuirks: ["Graph is strong for files and Excel workbook operations; Word/PowerPoint authoring may require local artifact generation plus upload rather than native edit APIs."],
    researchStatus: "researched",
    evidence: [{ date: reviewedAt, type: "docs-review", summary: "Microsoft Graph docs reviewed for file/DriveItem workflows, Excel workbook APIs, and general Graph constraints." }],
    docs: [
      { label: "Microsoft Graph API overview", url: "https://learn.microsoft.com/en-us/graph/use-the-api", lastReviewed: reviewedAt },
      { label: "Working with files in Microsoft Graph", url: "https://learn.microsoft.com/en-us/graph/api/resources/onedrive", lastReviewed: reviewedAt },
      { label: "Upload or replace DriveItem content", url: "https://learn.microsoft.com/graph/api/driveitem-put-content?view=graph-rest-1.0", lastReviewed: reviewedAt },
      { label: "Working with Excel in Microsoft Graph", url: "https://learn.microsoft.com/en-us/graph/api/resources/excel?view=graph-rest-1.0", lastReviewed: reviewedAt },
    ],
  },
  {
    id: "svg.code-native-svg-css-smil",
    displayName: "Code-native SVG/CSS/SMIL",
    capabilityArea: "svg-animation",
    installerShape: "artifact-generator",
    providerKind: "built-in",
    sourceModel: "ambient-built-in",
    recommendationTier: "recommended",
    recommendationSummary: "Primary path for simple, inspectable animated SVG artifacts that should remain standalone vector files.",
    recommendationMemo: {
      deploymentRole: "primary",
      recommendation: "Use code-native SVG/CSS/SMIL as the primary SVG-animation path when the requested output is a standalone, inspectable `.svg` or small HTML preview rather than app animation JSON or rendered video.",
      dogfoodTargets: [
        "Generate one tiny standalone `.svg` with `<title>`, accessible structure, CSS or SMIL animation, fixed viewport, and no external network assets.",
        "Render the SVG or an HTML wrapper in a browser, capture a still frame, and inspect the DOM for expected `<animate>`, `<animateMotion>`, CSS keyframes, or transform elements.",
        "Validate that the output is deterministic text, fits within the declared viewBox, and has a fallback static state for hosts that do not animate SVG.",
      ],
      promotionCriteria: [
        "Generated SVG is valid XML/SVG, self-contained, and inspectable by Pi without binary decoding.",
        "Browser screenshot or frame preview confirms the animation is visible and correctly framed.",
        "Pi guidance keeps this path for simple vector motion and routes product/app animations or rendered media to Lottie, HyperFrames, or Remotion.",
      ],
      fallbackGuidance: [
        "Use Lottie/dotLottie when the target app expects a Lottie JSON or `.lottie` animation.",
        "Use HyperFrames when the authored motion should render to MP4/WebM/MOV or PNG frames from HTML/CSS/JS.",
        "Use Remotion when the team already wants React/TSX video compositions and accepts its licensing/runtime constraints.",
      ],
    },
    bestFor: ["Standalone animated SVG", "Small inspectable vector motion", "Icons and simple data marks", "No-runtime embeds"],
    tradeoffs: ["Complex motion can become hard to maintain", "SMIL/CSS behavior must be checked in target browsers", "Not ideal for app animation systems that expect Lottie"],
    avoidWhen: ["The deliverable must be MP4/GIF/video", "The target product expects Lottie/dotLottie JSON", "The animation needs timeline editing or audio"],
    platforms: ["any"],
    hardwareFit: ["No special hardware for authoring or previewing tiny SVGs"],
    firstPartyTemplate: { available: true, templateId: "svg-animation:code-native-svg-css-smil", notes: "Use direct artifact generation and browser preview before heavier animation frameworks." },
    capabilityBuilderDefaults: {
      provider: "Code-native SVG/CSS/SMIL",
      locality: "local",
      outputFileArtifacts: ["svg", "html", "png"],
      responseFormats: ["text", "json"],
    },
    ambientContract: {
      commandContract: "Artifact generator writes a standalone SVG or HTML preview plus optional screenshot/frame proof.",
      descriptorRequirements: ["artifact-generator shape", "declared SVG/HTML outputs", "browser preview or structural validation proof", "accessibility/title notes"],
      artifactPolicy: "Write SVG/HTML files to workspace paths and store preview screenshots only when needed for validation.",
      validationTarget: "Generate a tiny animated SVG, inspect its structure, and render one browser frame or screenshot preview.",
    },
    secrets: [],
    networkHosts: [],
    modelAssets: [],
    localArtifactReadiness: {
      status: "local-ready",
      verifiedArtifacts: ["SVG text artifact path", "browser preview capability", "MDN SVG/SMIL animation reference"],
      missingOrBlockingArtifacts: [],
      minimumLocalSmokeTest: "Generate a tiny animated SVG and verify it through XML/DOM inspection plus a browser screenshot.",
    },
    runtimeState: { externalService: false, serviceKind: "none", statePaths: ["workspace SVG/HTML artifacts", "optional preview screenshot"] },
    costPrivacyNotes: ["Local deterministic text artifacts; no cloud upload required."],
    maintenanceNotes: ["Track target browser compatibility, SVG sanitization expectations, accessibility labels, and screenshot/frame validation coverage."],
    safetyBoundaries: ["Avoid inline script unless explicitly required; keep generated SVG self-contained and inspectable."],
    knownQuirks: ["SVG animation support differs by host context; some image surfaces render only the static first frame."],
    researchStatus: "researched",
    evidence: [{ date: reviewedAt, type: "docs-review", summary: "MDN SVG/SMIL animation docs reviewed for animate, animateTransform, and animateMotion support." }],
    docs: [
      { label: "MDN SVG animation with SMIL", url: "https://developer.mozilla.org/en-US/docs/Web/SVG/Guides/SVG_animation_with_SMIL", lastReviewed: reviewedAt },
      { label: "MDN SVG", url: "https://developer.mozilla.org/en-US/docs/Web/SVG", lastReviewed: reviewedAt },
    ],
  },
  {
    id: "svg.lottie-dotlottie",
    displayName: "Lottie / dotLottie",
    capabilityArea: "svg-animation",
    installerShape: "artifact-generator",
    providerKind: "local",
    sourceModel: "open-source",
    recommendationTier: "conditional",
    recommendationSummary: "App-friendly vector animation format for product UI embeds when the target player expects Lottie JSON or `.lottie` bundles.",
    recommendationMemo: {
      deploymentRole: "fallback",
      recommendation: "Use Lottie or dotLottie when the target product, mobile app, or web component expects a compact animation JSON/container with player support; do not choose it for arbitrary standalone SVGs unless the app runtime is the real target.",
      dogfoodTargets: [
        "Generate or adapt one tiny Lottie JSON with a simple shape animation and validate it with a local/web player or JSON schema-style structural checks.",
        "If `.lottie` is requested, verify the archive/container manifest, assets, and animation id rather than returning raw JSON only.",
        "Record player package/version, asset embedding strategy, dimensions, frame rate, duration, loop/autoplay settings, and any unsupported After Effects features.",
      ],
      promotionCriteria: [
        "Lottie JSON or dotLottie artifact opens in the target player and has deterministic dimensions, duration, and playback controls.",
        "Pi guidance states whether the deliverable is JSON, `.lottie`, or an HTML player preview.",
        "Known limitations such as text fonts, image assets, expressions, theming, and interactivity are visible before recommendation.",
      ],
      fallbackGuidance: [
        "Use code-native SVG/CSS/SMIL for small standalone vector artifacts.",
        "Use HyperFrames when the same authored motion must become MP4/WebM/MOV or PNG frames.",
        "Use Remotion when a React-based video composition is already the project standard.",
      ],
    },
    bestFor: ["Product UI animation", "Mobile/web animation assets", "App-player embeds", "Small reusable vector animations"],
    tradeoffs: ["Player/runtime support matters", "Not every After Effects/bodymovin feature behaves identically in every player", "More opaque than a tiny handwritten SVG"],
    avoidWhen: ["The requested deliverable is a plain SVG", "The user wants a rendered video file", "No target player/runtime is known"],
    platforms: ["any"],
    hardwareFit: ["Lightweight authoring and playback; validation depends on target player/runtime"],
    capabilityBuilderDefaults: {
      provider: "Lottie/dotLottie",
      locality: "local",
      outputFileArtifacts: ["json", "lottie", "html", "png"],
      responseFormats: ["json"],
      modelAssets: ["Lottie JSON", "dotLottie bundle"],
    },
    ambientContract: {
      commandContract: "Artifact generator writes Lottie JSON or `.lottie` plus a player preview and structured metadata.",
      descriptorRequirements: ["artifact-generator shape", "Lottie/dotLottie format declaration", "player/version notes", "duration/dimensions metadata"],
      artifactPolicy: "Write JSON/container and preview files to workspace paths; keep embedded image/font assets explicit.",
      validationTarget: "Generate a tiny animation and validate playback or structure through an approved Lottie/dotLottie player.",
    },
    secrets: [],
    networkHosts: [],
    modelAssets: [
      { name: "Lottie JSON", sourceUrl: "https://docs.lottiefiles.com/en/format/lottie-json", cachePolicy: "Workspace artifact." },
      { name: "dotLottie container", sourceUrl: "https://docs.lottiefiles.com/en/format/dotlottie", cachePolicy: "Workspace artifact." },
    ],
    localArtifactReadiness: {
      status: "conditional-local",
      verifiedArtifacts: ["LottieFiles format docs", "dotLottie format docs", "web player usage path"],
      missingOrBlockingArtifacts: ["Ambient-owned Lottie validation/render fixture", "target-player compatibility matrix"],
      minimumLocalSmokeTest: "Generate one tiny Lottie JSON, load it in a local preview player, and capture a first-frame screenshot or structural validation report.",
    },
    runtimeState: { externalService: false, serviceKind: "none", statePaths: ["workspace animation artifacts", "optional preview HTML"] },
    costPrivacyNotes: ["Local artifacts avoid cloud upload unless LottieFiles hosting or cloud editors are intentionally used."],
    maintenanceNotes: ["Track player versions, supported features, asset embedding, compression/container format, and target-platform compatibility."],
    safetyBoundaries: ["Do not fetch or embed third-party hosted animations without provenance and license review."],
    knownQuirks: ["Lottie JSON is a single-animation file; dotLottie is better for compressed bundles, themes, state machines, or multi-animation packaging."],
    researchStatus: "researched",
    evidence: [{ date: reviewedAt, type: "docs-review", summary: "LottieFiles format docs reviewed for Lottie JSON capabilities and dotLottie limitations/benefits." }],
    docs: [
      { label: "Lottie JSON format", url: "https://docs.lottiefiles.com/en/format/lottie-json", lastReviewed: reviewedAt },
      { label: "dotLottie format", url: "https://docs.lottiefiles.com/en/format/dotlottie", lastReviewed: reviewedAt },
      { label: "dotLottie web usage", url: "https://developers.lottiefiles.com/docs/dotlottie-player/dotlottie-web/usage/", lastReviewed: reviewedAt },
    ],
  },
  {
    id: "svg.hyperframes",
    displayName: "HyperFrames by HeyGen",
    capabilityArea: "svg-animation",
    installerShape: "custom-cli",
    providerKind: "local",
    sourceModel: "open-source",
    recommendationTier: "conditional",
    recommendationSummary: "Bundled Ambient CLI path for HTML/CSS/JS authored-motion rendering, including animated SVG/CSS patterns exported to video.",
    recommendationMemo: {
      deploymentRole: "fallback",
      recommendation: "Use HyperFrames when the user wants authored motion from HTML/CSS/JS, animated SVG/CSS patterns, social overlays, data videos, or explainable motion graphics that should render to MP4/WebM/MOV or PNG frames.",
      dogfoodTargets: [
        "Initialize or scaffold one tiny HyperFrames composition with animated SVG or CSS motion and render a short MP4 or PNG sequence through `npx hyperframes render`.",
        "Run preview/lint/render in a bounded workspace and save `index.html`, render settings, output media path, first-frame screenshot, duration, fps, and FFmpeg/Node versions.",
        "Verify optional capture/AI features are not invoked unless credentials such as GEMINI_API_KEY are intentionally provided through approved secret flow.",
      ],
      promotionCriteria: [
        "A tiny render completes locally with deterministic output metadata and no undeclared network calls.",
        "Pi guidance separates HTML-authored rendered media from standalone SVG or Lottie deliverables.",
        "Node.js >= 22, FFmpeg, browser/GPU flags, Docker option, and output format are all declared before installation or render.",
      ],
      fallbackGuidance: [
        "Use code-native SVG/CSS/SMIL when the deliverable should remain a standalone vector file.",
        "Use Lottie/dotLottie when the target is app-player animation JSON rather than rendered video.",
        "Use Remotion when a React/TSX video stack is already preferred or production rendering infrastructure is needed.",
      ],
    },
    bestFor: ["HTML-authored motion graphics", "Animated charts and overlays", "Deterministic MP4/WebM/MOV rendering", "Agent-friendly video from HTML/CSS/JS"],
    tradeoffs: ["Requires Node.js and FFmpeg", "Rendered video is heavier than SVG/Lottie", "Newer project surface needs Ambient dogfood before default recommendation"],
    avoidWhen: ["The deliverable must be a lightweight standalone SVG", "The target app already requires Lottie JSON", "The user cannot install Node/FFmpeg or run browser rendering"],
    platforms: ["macos-arm64", "macos-x64", "linux-x64"],
    hardwareFit: ["CPU works for tiny renders; GPU/browser flags and FFmpeg settings matter for longer or richer compositions"],
    capabilityBuilderDefaults: {
      provider: "HyperFrames by HeyGen",
      locality: "local",
      outputFileArtifacts: ["mp4", "webm", "mov", "png", "html"],
      responseFormats: ["json", "text"],
      modelAssets: ["Node.js >= 22", "FFmpeg"],
    },
    firstPartyTemplate: { available: true, templateId: "ambient-cli:ambient-hyperframes", notes: "Use the bundled Ambient CLI adapter for doctor/init/inspect/render before considering custom scaffolding." },
    ambientContract: {
      commandContract: "Ambient CLI package ambient-hyperframes previews or renders one bounded HyperFrames composition and returns output media paths plus render metadata.",
      descriptorRequirements: ["custom-cli shape", "Ambient CLI package ambient-hyperframes", "Node/FFmpeg dependency declaration", "output format declaration", "preview/render artifact metadata"],
      artifactPolicy: "Persist composition source, render logs, output media, and first-frame proof by workspace path.",
      validationTarget: "Render a 1-3 second animated composition through ambient_cli hyperframes_render and verify the media/frame artifact exists and is non-empty.",
    },
    secrets: [],
    networkHosts: [],
    modelAssets: [
      { name: "HyperFrames CLI/runtime", sourceUrl: "https://github.com/heygen-com/hyperframes", licenseNote: "Apache-2.0", cachePolicy: "Project-local npm dependencies." },
      { name: "FFmpeg", sourceUrl: "https://ffmpeg.org/", cachePolicy: "System install or managed binary path." },
    ],
    localArtifactReadiness: {
      status: "conditional-local",
      verifiedArtifacts: ["Bundled Ambient CLI adapter", "GitHub repo", "CLI docs", "render docs", "Apache-2.0 license", "Node.js >= 22 and FFmpeg requirements"],
      missingOrBlockingArtifacts: ["Live Pi render dogfood", "cross-platform install dogfood", "media validation helper for output codecs"],
      minimumLocalSmokeTest: "Run ambient_cli hyperframes_render on a tiny composition and verify MP4 or PNG sequence output plus first-frame screenshot.",
    },
    runtimeState: { externalService: true, serviceKind: "local-daemon", statePaths: ["composition directory", "render output", "preview server logs"], healthCheck: "Run `npx hyperframes preview` for local preview or `npx hyperframes render` for non-interactive validation." },
    costPrivacyNotes: ["Rendering is local; optional website capture or AI-description features may call external services only if explicitly enabled."],
    maintenanceNotes: ["Track HyperFrames CLI version, Node version, FFmpeg availability, Chrome/browser flags, Docker mode, codecs, and output format support."],
    safetyBoundaries: ["Do not run website capture or external asset downloads without user approval; keep render sources and assets explicit."],
    knownQuirks: ["Preview uses real-time browser playback, while render captures frames one at a time, so preview performance can differ from final output speed."],
    researchStatus: "researched",
    evidence: [{ date: reviewedAt, type: "docs-review", summary: "HyperFrames GitHub, CLI, and rendering docs reviewed; artifacts are enough for a conditional local render smoke test." }],
    docs: [
      { label: "HyperFrames repo", url: "https://github.com/heygen-com/hyperframes", lastReviewed: reviewedAt },
      { label: "HyperFrames CLI", url: "https://hyperframes.heygen.com/packages/cli", lastReviewed: reviewedAt },
      { label: "HyperFrames rendering", url: "https://hyperframes.heygen.com/guides/rendering", lastReviewed: reviewedAt },
    ],
  },
  {
    id: "svg.remotion",
    displayName: "Remotion",
    capabilityArea: "svg-animation",
    installerShape: "custom-cli",
    providerKind: "local",
    sourceModel: "mixed",
    recommendationTier: "conditional",
    recommendationSummary: "React/TSX video-rendering stack for authored motion when the output should be video and the team accepts Remotion's runtime and licensing constraints.",
    recommendationMemo: {
      deploymentRole: "fallback",
      recommendation: "Use Remotion when the project already wants React/TSX motion components, programmatic video rendering, or production render infrastructure; keep it secondary to simpler SVG/Lottie paths for small vector assets.",
      dogfoodTargets: [
        "Create one tiny Remotion composition with SVG or CSS motion, render it with `renderMedia()` or the CLI, and save MP4 plus first-frame proof.",
        "Record composition id, width, height, fps, durationInFrames, codec, outputLocation, browser/FFmpeg versions, and package/license notes.",
        "Verify local render works without hidden downloads and document any Lambda/Cloud Run or commercial-license implications separately.",
      ],
      promotionCriteria: [
        "Tiny local render succeeds with deterministic media metadata and validated output path.",
        "Licensing/commercial-use threshold and package/runtime requirements are visible in Pi guidance.",
        "Pi routes standalone SVG asks to code-native SVG and app-player asks to Lottie before suggesting a React video stack.",
      ],
      fallbackGuidance: [
        "Use code-native SVG/CSS/SMIL for standalone vector artifacts.",
        "Use Lottie/dotLottie for product/app animation assets.",
        "Use HyperFrames when HTML/CSS/JS authoring is simpler than React/TSX for the requested motion graphic.",
      ],
    },
    bestFor: ["React-authored video", "Programmatic MP4/GIF rendering", "Complex timelines with code", "Production render pipelines"],
    tradeoffs: ["Heavier setup than SVG or Lottie", "License/commercial terms need review", "Requires browser/FFmpeg rendering infrastructure"],
    avoidWhen: ["The user only needs a small standalone SVG", "The target app expects Lottie JSON", "React/TSX is not desired"],
    platforms: ["macos-arm64", "macos-x64", "linux-x64"],
    hardwareFit: ["CPU-friendly for tiny renders; longer videos need careful browser/FFmpeg resource limits"],
    capabilityBuilderDefaults: {
      provider: "Remotion",
      locality: "local",
      outputFileArtifacts: ["mp4", "webm", "gif", "png"],
      responseFormats: ["json", "text"],
      modelAssets: ["Node.js", "browser/FFmpeg dependencies"],
    },
    ambientContract: {
      commandContract: "CLI or renderer wrapper renders one bounded Remotion composition and returns media path plus render metadata.",
      descriptorRequirements: ["custom-cli shape", "composition metadata", "codec/output declaration", "license/runtime notes", "render proof"],
      artifactPolicy: "Persist composition source, render logs, output media, and first-frame proof by workspace path.",
      validationTarget: "Render a tiny React/TSX composition to MP4 and verify media metadata plus first frame.",
    },
    secrets: [],
    networkHosts: [],
    modelAssets: [{ name: "Remotion packages", sourceUrl: "https://www.remotion.dev/docs/", licenseNote: "Review Remotion licensing/commercial terms before promotion.", cachePolicy: "Project-local npm dependencies." }],
    localArtifactReadiness: {
      status: "conditional-local",
      verifiedArtifacts: ["Remotion project setup docs", "renderMedia renderer docs", "agent-skills guidance"],
      missingOrBlockingArtifacts: ["Ambient-owned tiny render fixture", "license/commercial-use approval", "cross-platform render dependency validation"],
      minimumLocalSmokeTest: "Create a tiny Remotion composition and render MP4 with first-frame validation.",
    },
    runtimeState: { externalService: false, serviceKind: "none", statePaths: ["Remotion project directory", "render output", "package cache"] },
    costPrivacyNotes: ["Local rendering avoids cloud upload; hosted/Lambda render paths have separate cost and privacy implications."],
    maintenanceNotes: ["Track Remotion package version, Node/browser/FFmpeg requirements, codec support, and license/commercial-use constraints."],
    safetyBoundaries: ["Do not use remote render infrastructure or download external assets without explicit user approval."],
    knownQuirks: ["Remotion is excellent for React video systems, but it is too heavy for many simple SVG/Lottie requests."],
    researchStatus: "researched",
    evidence: [{ date: reviewedAt, type: "docs-review", summary: "Remotion project setup and renderMedia docs reviewed as a conditional rendered-motion fallback." }],
    docs: [
      { label: "Remotion getting started", url: "https://www.remotion.dev/docs/", lastReviewed: reviewedAt },
      { label: "Remotion renderMedia", url: "https://www.remotion.dev/docs/renderer/render-media", lastReviewed: reviewedAt },
    ],
  },
  {
    id: "social.bluesky-atproto",
    displayName: "Bluesky / AT Protocol",
    capabilityArea: "social-media",
    installerShape: "connector",
    providerKind: "hybrid",
    sourceModel: "open-source",
    recommendationTier: "conditional",
    recommendationSummary: "First social API dogfood candidate for draft-approved posting because AT Protocol exposes explicit post records, URI/CID outputs, and open docs.",
    recommendationMemo: {
      deploymentRole: "primary",
      recommendation: "Use Bluesky / AT Protocol as the first social-media API dogfood candidate for draft-approved posts, not autonomous posting. It has clear record semantics (`app.bsky.feed.post`), post result URI/CID outputs, and lower platform-approval friction than X or LinkedIn.",
      dogfoodTargets: [
        "Run read-only session/auth validation first, then create a draft preview containing target handle/DID, PDS host, post text, facets/links, media alt text, visibility assumptions, and estimated record payload.",
        "Only after explicit user approval, create one tiny test post through the PDS, capture the returned `at://` URI and CID, then optionally delete it through the same approved account.",
        "Save sanitized request metadata, PDS host, handle/DID, URI, CID, output URL, rate-limit headers if present, and audit event ids without exposing `BLUESKY_APP_PASSWORD` or session JWTs.",
      ],
      promotionCriteria: [
        "Ambient-managed secret capture stores `BLUESKY_APP_PASSWORD` and no password/session JWT appears in Pi-visible logs, descriptors, artifacts, or tool args.",
        "Every write path presents account identity, exact post text/media, target service host, and a destructive/non-destructive action label for explicit approval.",
        "Pi guidance explains AT Protocol record state, URI/CID verification, rate limits, media metadata stripping, and delete/redraft behavior before any write.",
      ],
      fallbackGuidance: [
        "Use Mastodon API when the user wants ActivityPub/fediverse posting, instance-local control, or idempotency-key support on status creation.",
        "Use X API or LinkedIn Posts API only when the target audience requires those platforms and account/app access has been approved.",
        "Use browser-mediated drafts when API credentials are unavailable or the user wants to inspect the platform composer before posting.",
      ],
    },
    bestFor: ["Draft-approved Bluesky posts", "Open social protocol experiments", "URI/CID-verifiable social output"],
    tradeoffs: ["App passwords/session JWTs need careful secret handling", "PDS/AppView routing can confuse wrapper design", "Writes are public/reputation-affecting"],
    avoidWhen: ["The user needs LinkedIn/X audience reach", "The user is unwilling to approve every externally visible action"],
    platforms: ["any"],
    hardwareFit: ["No local acceleration required."],
    capabilityBuilderDefaults: {
      provider: "Bluesky / AT Protocol",
      locality: "network",
      responseFormats: ["json"],
      envNames: ["BLUESKY_APP_PASSWORD"],
      networkHosts: ["bsky.social", "api.bsky.app", "public.api.bsky.app"],
    },
    ambientContract: {
      commandContract: "Connector must support read/draft preview first; write/delete operations require explicit approval and return URI/CID plus audit metadata.",
      descriptorRequirements: ["connector shape", "secret env BLUESKY_APP_PASSWORD", "target handle/DID", "PDS host", "preview/approval boundary", "audit output"],
      artifactPolicy: "Persist sanitized draft payloads, approval records, post URI/CID, deletion results, and rate-limit/error notes.",
      validationTarget: "Create a session, build a draft preview, and only after explicit approval create a tiny post, verify URI/CID, and optionally delete it.",
    },
    secrets: [{ envName: "BLUESKY_APP_PASSWORD", required: true, capture: "ambient_capability_builder_secret_request" }],
    networkHosts: ["bsky.social", "api.bsky.app", "public.api.bsky.app"],
    modelAssets: [],
    localArtifactReadiness: {
      status: "hosted-reference",
      verifiedArtifacts: ["createSession quickstart", "app.bsky.feed.post record schema", "URI/CID response", "API host/auth docs", "rate-limit docs"],
      missingOrBlockingArtifacts: ["Credentialed Ambient connector smoke test", "approval UI for social writes"],
      minimumLocalSmokeTest: "Create an authenticated session, render a draft preview, then with explicit approval create and verify a tiny post URI/CID.",
    },
    runtimeState: { externalService: true, serviceKind: "hosted-api", statePaths: ["session token cache", "draft preview", "post URI/CID audit record"], healthCheck: "Authenticated profile/session check before any draft or write." },
    costPrivacyNotes: ["Cloud/social network action; posts may be public and indexed. Authentication secrets and session JWTs must never be exposed."],
    maintenanceNotes: ["Track OAuth/app-password guidance, PDS/AppView host behavior, write rate limits, media upload limits, and post record schema changes."],
    safetyBoundaries: ["No autonomous posting, liking, following, reposting, or deletion; require account confirmation and explicit approval for every write."],
    knownQuirks: ["Public reads can use cached AppView hosts, but writes go through the account PDS and produce repository records."],
    researchStatus: "researched",
    evidence: [{ date: reviewedAt, type: "docs-review", summary: "Bluesky docs expose createSession, post record schema, URI/CID outputs, API host routing, and rate-limit guidance." }],
    docs: [
      { label: "Bluesky get started", url: "https://docs.bsky.app/docs/get-started", lastReviewed: reviewedAt },
      { label: "Bluesky creating a post", url: "https://docs.bsky.app/docs/tutorials/creating-a-post", lastReviewed: reviewedAt },
      { label: "Bluesky API hosts and auth", url: "https://docs.bsky.app/docs/advanced-guides/api-directory", lastReviewed: reviewedAt },
      { label: "Bluesky rate limits", url: "https://docs.bsky.app/docs/advanced-guides/rate-limits", lastReviewed: reviewedAt },
    ],
  },
  {
    id: "social.mastodon-api",
    displayName: "Mastodon API",
    capabilityArea: "social-media",
    installerShape: "connector",
    providerKind: "hybrid",
    sourceModel: "open-source",
    recommendationTier: "conditional",
    recommendationSummary: "Fediverse social connector candidate with granular OAuth scopes and idempotency-key support for status creation.",
    recommendationMemo: {
      deploymentRole: "fallback",
      recommendation: "Use Mastodon API when the user wants a fediverse/ActivityPub social provider and can specify the target instance. It is attractive for V1 dogfood because status creation supports granular OAuth scopes and `Idempotency-Key`, but instance variance means every wrapper must declare host, scopes, visibility, and media behavior.",
      dogfoodTargets: [
        "Register or configure a test application for one explicit instance, request the smallest useful scopes such as `read:statuses` and `write:statuses`, and verify account identity before drafting.",
        "Create a draft preview with instance host, account handle, status text, visibility, content warning, media ids/alt text, schedule time, and idempotency key.",
        "Only after explicit approval, post one tiny status with `Idempotency-Key`, verify the returned status id/URL, and optionally delete it while saving source text for delete-and-redraft behavior.",
      ],
      promotionCriteria: [
        "Ambient-managed secret capture stores `MASTODON_ACCESS_TOKEN` without exposing token values in Pi-visible surfaces.",
        "Every write path includes account confirmation, visibility, content warning, exact text/media, idempotency key, and explicit approval.",
        "Pi guidance warns that Mastodon is instance-dependent and records the target instance host, API version/feature support, and rate-limit/idempotency behavior.",
      ],
      fallbackGuidance: [
        "Use Bluesky / AT Protocol when open social protocol experimentation and URI/CID verification are a better fit.",
        "Use browser-mediated drafts when the target instance blocks API access or the user needs composer inspection.",
        "Use X API or LinkedIn only when the target audience requires those closed platforms and their credential/app constraints are accepted.",
      ],
    },
    bestFor: ["Fediverse/ActivityPub posting", "Instance-scoped social workflows", "Idempotent status creation"],
    tradeoffs: ["Instance capabilities and limits vary", "OAuth app setup is per instance", "Public/reputation impact still requires approval"],
    avoidWhen: ["The user has not specified a target instance/account", "The target platform is X, LinkedIn, or Bluesky"],
    platforms: ["any"],
    hardwareFit: ["No local acceleration required."],
    capabilityBuilderDefaults: {
      provider: "Mastodon",
      locality: "network",
      responseFormats: ["json"],
      envNames: ["MASTODON_ACCESS_TOKEN"],
      networkHosts: ["configured Mastodon instance host"],
    },
    ambientContract: {
      commandContract: "Connector drafts first; status create/delete/schedule operations require explicit approval, account confirmation, and idempotency/audit metadata.",
      descriptorRequirements: ["connector shape", "secret env MASTODON_ACCESS_TOKEN", "instance host", "OAuth scopes", "preview/approval boundary", "idempotency key"],
      artifactPolicy: "Persist sanitized draft payloads, approval records, status ids/URLs, deletion responses, and instance/rate-limit notes.",
      validationTarget: "Verify account identity and scopes, draft one tiny status, then with explicit approval post with Idempotency-Key and verify status id/URL.",
    },
    secrets: [{ envName: "MASTODON_ACCESS_TOKEN", required: true, capture: "ambient_capability_builder_secret_request" }],
    networkHosts: ["configured Mastodon instance host"],
    modelAssets: [],
    localArtifactReadiness: {
      status: "hosted-reference",
      verifiedArtifacts: ["status creation docs", "OAuth scope docs", "Idempotency-Key support", "delete-and-redraft source behavior"],
      missingOrBlockingArtifacts: ["Credentialed Ambient connector smoke test", "instance-selection UI and approval surface"],
      minimumLocalSmokeTest: "Authenticate against one chosen instance, draft a status, post with Idempotency-Key after approval, verify status id/URL, and optionally delete.",
    },
    runtimeState: { externalService: true, serviceKind: "hosted-api", statePaths: ["instance config", "OAuth token cache", "draft preview", "status id/URL audit record"], healthCheck: "GET account/verify credentials on the configured instance." },
    costPrivacyNotes: ["Usually no API charge, but posts are public or semi-public according to instance visibility and federation behavior."],
    maintenanceNotes: ["Track target instance version, OAuth scopes, status parameters, idempotency behavior, visibility defaults, scheduling support, and media upload constraints."],
    safetyBoundaries: ["No autonomous posting, boosting, favoriting, following, pinning, deletion, or scheduled posting without explicit approval."],
    knownQuirks: ["Mastodon API behavior can vary by server version and instance policy; the provider card must not imply one global host."],
    researchStatus: "researched",
    evidence: [{ date: reviewedAt, type: "docs-review", summary: "Mastodon docs expose status create/delete, granular OAuth scopes, scheduled statuses, and Idempotency-Key support." }],
    docs: [
      { label: "Mastodon statuses API", url: "https://docs.joinmastodon.org/methods/statuses/", lastReviewed: reviewedAt },
      { label: "Mastodon OAuth scopes", url: "https://docs.joinmastodon.org/api/oauth-scopes/", lastReviewed: reviewedAt },
    ],
  },
  {
    id: "social.x-api",
    displayName: "X API",
    capabilityArea: "social-media",
    installerShape: "connector",
    providerKind: "cloud",
    sourceModel: "closed-source",
    recommendationTier: "conditional",
    recommendationSummary: "Reserved closed-platform social connector for X posting/search workflows when official API access and user OAuth are approved.",
    recommendationMemo: {
      deploymentRole: "reserved",
      recommendation: "Use X API only when the user's target audience requires X and the official developer app, user OAuth, pricing/rate limits, and platform policy are accepted. Keep the V1 posture draft/read-first; posting, deleting, replying, quoting, liking, or following must be approval-gated.",
      dogfoodTargets: [
        "Verify approved developer app access and user OAuth token scopes before exposing any draft or write tool.",
        "Run read-only account/post lookup first, then create a draft preview with authenticated account, exact post text, reply/quote/media/poll payload, rate-limit context, and delete/rollback option.",
        "Only after explicit approval, create one tiny test Post via `POST /2/tweets`, verify returned Post id through lookup, and optionally delete it through `DELETE /2/tweets/:id`.",
      ],
      promotionCriteria: [
        "Ambient-managed OAuth/secret flow stores `X_USER_ACCESS_TOKEN` without exposing token values in Pi-visible logs, descriptors, artifacts, or tool args.",
        "Every write path names the authenticated account, target action, exact payload, rate-limit/cost context, and public visibility before approval.",
        "Pi guidance refuses browser/internal-GraphQL bypasses and uses only official X API endpoints and platform-compliant flows.",
      ],
      fallbackGuidance: [
        "Use Bluesky / AT Protocol or Mastodon API for lower-friction open social dogfood when target audience permits.",
        "Use LinkedIn Posts API for professional/company-page audiences when LinkedIn app/product permissions are approved.",
        "Use browser-mediated drafts when official API access is unavailable and the user wants to manually review/post in the platform UI.",
      ],
    },
    bestFor: ["X audience reach", "Official X post lookup/create/delete workflows", "User-approved X social automation"],
    tradeoffs: ["Pay-per-use/pricing and rate-limit constraints", "Developer app and user OAuth setup", "High public reputation risk"],
    avoidWhen: ["The user lacks approved X API access", "The workflow would bypass official APIs", "The user expects autonomous public posting"],
    platforms: ["any"],
    hardwareFit: ["No local acceleration required."],
    capabilityBuilderDefaults: {
      provider: "X API",
      locality: "network",
      responseFormats: ["json"],
      envNames: ["X_USER_ACCESS_TOKEN"],
      networkHosts: ["api.x.com"],
    },
    ambientContract: {
      commandContract: "Connector supports read/draft first; X write/delete/reply/quote actions require explicit approval and audit metadata.",
      descriptorRequirements: ["connector shape", "secret env X_USER_ACCESS_TOKEN", "developer app access notes", "user OAuth scope notes", "preview/approval boundary", "audit output"],
      artifactPolicy: "Persist sanitized draft payloads, approval records, Post ids, lookup/delete responses, rate-limit/error notes, and cost/policy notes.",
      validationTarget: "Verify account/app access, draft one tiny Post, then after approval create and look up the Post id through official X API endpoints.",
    },
    secrets: [{ envName: "X_USER_ACCESS_TOKEN", required: true, capture: "ambient_capability_builder_secret_request" }],
    networkHosts: ["api.x.com"],
    modelAssets: [],
    localArtifactReadiness: {
      status: "hosted-reference",
      verifiedArtifacts: ["X API overview", "Manage Posts endpoints", "Post lookup endpoints", "rate-limit docs", "user OAuth prerequisite"],
      missingOrBlockingArtifacts: ["Credentialed Ambient OAuth connector smoke test", "pricing/rate-limit guardrail UI"],
      minimumLocalSmokeTest: "With approved X app/user token, perform a read-only lookup, draft a post, then with explicit approval create and verify a tiny Post id.",
    },
    runtimeState: { externalService: true, serviceKind: "hosted-api", statePaths: ["OAuth token cache", "draft preview", "Post id audit record"], healthCheck: "Read-only authenticated user or Post lookup before drafting." },
    costPrivacyNotes: ["X API is pay-per-use/plan-limited; public posts and account actions affect reputation and may incur platform costs or quota use."],
    maintenanceNotes: ["Track pricing/access changes, rate limits, OAuth requirements, manage-post endpoint behavior, media upload requirements, and policy changes."],
    safetyBoundaries: ["No unofficial API bypasses; no autonomous public posting/deleting/replying/liking/following; explicit approval is mandatory for every write."],
    knownQuirks: ["Self-serve reply and posting constraints can be narrower than users expect; media must be uploaded separately before attaching to a Post."],
    researchStatus: "researched",
    evidence: [{ date: reviewedAt, type: "docs-review", summary: "X docs reviewed for pay-per-use overview, Manage Posts create/delete endpoints, lookup endpoints, rate limits, and OAuth prerequisites." }],
    docs: [
      { label: "X API overview", url: "https://docs.x.com/overview", lastReviewed: reviewedAt },
      { label: "X Manage Posts", url: "https://docs.x.com/x-api/posts/manage-tweets/introduction", lastReviewed: reviewedAt },
      { label: "X Post lookup", url: "https://docs.x.com/x-api/posts/lookup/introduction", lastReviewed: reviewedAt },
      { label: "X rate limits", url: "https://docs.x.com/x-api/fundamentals/rate-limits", lastReviewed: reviewedAt },
    ],
  },
  {
    id: "social.linkedin-posts-api",
    displayName: "LinkedIn Posts API",
    capabilityArea: "social-media",
    installerShape: "connector",
    providerKind: "cloud",
    sourceModel: "closed-source",
    recommendationTier: "research-needed",
    recommendationSummary: "Reserved professional-network connector because LinkedIn posting depends on product permissions, versioned APIs, and member or organization scopes.",
    recommendationMemo: {
      deploymentRole: "reserved",
      recommendation: "Use LinkedIn Posts API only for professional-network workflows where the app has the right LinkedIn product permissions and the user approves the target member or organization account. It should remain reserved until OAuth/product approval and version-header handling are dogfooded.",
      dogfoodTargets: [
        "Verify app access, `Linkedin-Version` header, `X-Restli-Protocol-Version: 2.0.0`, and member or organization scopes before exposing any draft.",
        "Run read-only post/account/page validation first, then create a draft preview with author URN, member/company role, exact commentary, media/document/article fields, visibility/distribution, and version header.",
        "Only after explicit approval, create one tiny test post if credentials and target account permissions are intentionally provided, then retrieve it with `viewContext=AUTHOR` and optionally delete it.",
      ],
      promotionCriteria: [
        "Ambient-managed OAuth/secret flow stores `LINKEDIN_ACCESS_TOKEN` without exposing token values in Pi-visible surfaces.",
        "The wrapper rejects writes unless author URN, account type, required scope, page role if applicable, version header, exact payload, and approval are present.",
        "Pi guidance explains Posts API versioning, `w_member_social` versus organization scopes, restricted read scopes, and professional reputation risk.",
      ],
      fallbackGuidance: [
        "Use browser-mediated drafts when app approval or organization permissions are not ready and the user can post manually.",
        "Use Bluesky / AT Protocol or Mastodon API for earlier social-provider dogfood where professional-network targeting is not required.",
        "Use X API when X audience reach matters more than LinkedIn's organization/member permission model.",
      ],
    },
    bestFor: ["LinkedIn member posts", "LinkedIn organization/page posts", "Professional audience workflows"],
    tradeoffs: ["Product/app approval and scopes can block use", "Version headers change over time", "Organization posts require page roles"],
    avoidWhen: ["The app lacks LinkedIn product permissions", "The target author/account is ambiguous", "The user expects generic social posting"],
    platforms: ["any"],
    hardwareFit: ["No local acceleration required."],
    capabilityBuilderDefaults: {
      provider: "LinkedIn Posts API",
      locality: "network",
      responseFormats: ["json"],
      envNames: ["LINKEDIN_ACCESS_TOKEN"],
      networkHosts: ["api.linkedin.com"],
    },
    ambientContract: {
      commandContract: "Connector supports read/draft first; LinkedIn create/update/delete actions require explicit approval, author URN confirmation, scopes, and version headers.",
      descriptorRequirements: ["connector shape", "secret env LINKEDIN_ACCESS_TOKEN", "author URN", "scope/page-role notes", "Linkedin-Version header", "preview/approval boundary"],
      artifactPolicy: "Persist sanitized draft payloads, approval records, post URNs, retrieve/delete responses, version-header notes, and permission errors.",
      validationTarget: "Verify API version/scopes/author URN, draft one post, and only after approval create and retrieve a tiny post with AUTHOR context.",
    },
    secrets: [{ envName: "LINKEDIN_ACCESS_TOKEN", required: true, capture: "ambient_capability_builder_secret_request" }],
    networkHosts: ["api.linkedin.com"],
    modelAssets: [],
    localArtifactReadiness: {
      status: "hosted-reference",
      verifiedArtifacts: ["Posts API docs", "member/organization scope table", "version-header docs", "protocol header docs"],
      missingOrBlockingArtifacts: ["LinkedIn app/product approval dogfood", "OAuth connector flow", "organization role validation"],
      minimumLocalSmokeTest: "With approved access, validate version headers and author URN, draft a post, then with approval create/retrieve/delete a tiny post.",
    },
    runtimeState: { externalService: true, serviceKind: "hosted-api", statePaths: ["OAuth token cache", "draft preview", "post URN audit record", "API version config"], healthCheck: "Read-only profile/post/page validation before drafting." },
    costPrivacyNotes: ["No generic API fee assumed, but app approval, product access, and professional reputation risk are the main constraints."],
    maintenanceNotes: ["Track monthly Marketing API versions, sunset notices, required headers, scope restrictions, organization role requirements, and content schema changes."],
    safetyBoundaries: ["No autonomous posting, updating, deleting, commenting, or liking; explicit account/author confirmation and approval are mandatory."],
    knownQuirks: ["The versioned Posts API replaces older ugcPosts/shares paths; restricted scopes and page roles often block otherwise-correct requests."],
    researchStatus: "researched",
    evidence: [{ date: reviewedAt, type: "docs-review", summary: "LinkedIn Posts API and versioning docs reviewed for create/retrieve/delete endpoints, headers, member/organization scopes, and restricted access caveats." }],
    docs: [
      { label: "LinkedIn Posts API", url: "https://learn.microsoft.com/en-us/linkedin/marketing/community-management/shares/posts-api", lastReviewed: reviewedAt },
      { label: "LinkedIn API versioning", url: "https://learn.microsoft.com/en-us/linkedin/marketing/versioning", lastReviewed: reviewedAt },
      { label: "Share on LinkedIn", url: "https://learn.microsoft.com/en-us/linkedin/consumer/integrations/self-serve/share-on-linkedin", lastReviewed: reviewedAt },
    ],
  },
  {
    id: "agentic-services.stripe-sandbox",
    displayName: "Stripe Sandbox",
    capabilityArea: "agentic-services",
    installerShape: "connector",
    providerKind: "cloud",
    sourceModel: "closed-source",
    recommendationTier: "conditional",
    recommendationSummary: "First agentic-service/payment workflow candidate, limited to sandbox/test mode, previews, idempotency, and explicit approval.",
    recommendationMemo: {
      deploymentRole: "primary",
      recommendation: "Use Stripe Sandbox as the first agentic-services provider card because Stripe has strong sandbox/test-mode docs, idempotent requests, PaymentIntent lifecycle guidance, and refund APIs. Keep V1 sandbox-only: no autonomous money movement, no live-mode keys, and no charge/refund/subscription mutation without typed preview and explicit approval.",
      dogfoodTargets: [
        "Validate that `STRIPE_SECRET_KEY` is a sandbox/test key such as `sk_test_` before any API call; reject live keys in V1 provider dogfood.",
        "Run read-only balance/customer/product or create-only sandbox object checks first, then draft a typed action preview with account mode, amount/currency, object ids, idempotency key, reversal/refund implications, and audit id.",
        "Only after explicit approval, create a tiny sandbox PaymentIntent or Customer using `Idempotency-Key`, retrieve it, and save request id, object id, mode, metadata, and rollback/reversal notes.",
      ],
      promotionCriteria: [
        "Ambient-managed secret capture stores `STRIPE_SECRET_KEY` and optional `STRIPE_WEBHOOK_SECRET` without exposing values in Pi-visible logs, descriptors, artifacts, or tool args.",
        "The wrapper refuses live-mode keys and any money-affecting action unless a typed preview, explicit approval, idempotency key, and audit trail are present.",
        "Pi guidance explains sandbox versus live mode, PaymentIntent lifecycle, duplicate-prevention idempotency, refund/rollback limitations, and webhook/readback validation.",
      ],
      fallbackGuidance: [
        "Use read-only/draft-only workflows if the user needs live Stripe account inspection before any sandbox mutation.",
        "Use Plaid/Teller-style providers only for later account-data research; do not treat them as money-movement providers in V1.",
        "Defer live Stripe charges, refunds, subscriptions, transfers, payouts, and account changes until a separate high-risk approval and audit system is implemented.",
      ],
    },
    bestFor: ["Sandbox payment workflow dogfood", "Idempotent API action previews", "PaymentIntent and refund lifecycle research"],
    tradeoffs: ["High-risk domain even in sandbox", "Live mode must be rejected in V1", "Rollback is not universal; refunds/reversals have constraints"],
    avoidWhen: ["The user wants autonomous live payments", "The task requires bank movement or production charges", "A typed approval/audit surface is unavailable"],
    platforms: ["any"],
    hardwareFit: ["No local acceleration required."],
    capabilityBuilderDefaults: {
      provider: "Stripe Sandbox",
      locality: "network",
      responseFormats: ["json"],
      envNames: ["STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET"],
      networkHosts: ["api.stripe.com"],
    },
    ambientContract: {
      commandContract: "Connector is sandbox-only in V1; read/create/update/refund-like actions require typed preview, explicit approval, idempotency key, object readback, and audit metadata.",
      descriptorRequirements: ["connector shape", "secret env STRIPE_SECRET_KEY", "sandbox/live-mode guard", "typed preview", "explicit approval boundary", "idempotency key", "audit output"],
      artifactPolicy: "Persist sanitized previews, approval records, Stripe request ids, object ids, mode/key-prefix checks, readback responses, and rollback/reversal notes.",
      validationTarget: "Reject live keys, create a sandbox preview, then with explicit approval create and retrieve a tiny sandbox object using Idempotency-Key.",
    },
    secrets: [
      { envName: "STRIPE_SECRET_KEY", required: true, capture: "ambient_capability_builder_secret_request" },
      { envName: "STRIPE_WEBHOOK_SECRET", required: false, capture: "ambient_capability_builder_secret_request" },
    ],
    networkHosts: ["api.stripe.com"],
    modelAssets: [],
    localArtifactReadiness: {
      status: "hosted-reference",
      verifiedArtifacts: ["sandbox/test-mode docs", "API key prefix docs", "idempotent request docs", "PaymentIntent lifecycle docs", "refund docs"],
      missingOrBlockingArtifacts: ["Credentialed sandbox Ambient connector smoke test", "typed high-risk approval UI", "webhook readback validation"],
      minimumLocalSmokeTest: "With `sk_test_`, draft a typed preview, then after approval create and retrieve one sandbox object using Idempotency-Key and save audit metadata.",
    },
    runtimeState: { externalService: true, serviceKind: "hosted-api", statePaths: ["secret mode check", "typed preview", "approval record", "Stripe object/request id audit record"], healthCheck: "Read-only authenticated API call with sandbox key prefix validation." },
    costPrivacyNotes: ["Sandbox/test mode avoids real money movement; live keys and live transactions are explicitly out of V1 scope."],
    maintenanceNotes: ["Track Stripe API version, sandbox/test-mode behavior, idempotency semantics, PaymentIntent lifecycle, refund constraints, webhook signatures, and request id logging."],
    safetyBoundaries: ["No autonomous money movement; no live-mode keys; every mutation needs typed preview, explicit approval, idempotency key, and audit trail."],
    knownQuirks: ["Test mode sandboxes can share some settings with live mode; assume Dashboard setting changes may affect live mode unless Stripe clearly labels them isolated."],
    researchStatus: "researched",
    evidence: [{ date: reviewedAt, type: "docs-review", summary: "Stripe sandbox/test-mode, API keys, idempotent requests, PaymentIntent lifecycle, and refund docs reviewed for V1 high-risk guardrails." }],
    docs: [
      { label: "Stripe testing use cases", url: "https://docs.stripe.com/testing-use-cases", lastReviewed: reviewedAt },
      { label: "Stripe API keys", url: "https://docs.stripe.com/keys", lastReviewed: reviewedAt },
      { label: "Stripe idempotent requests", url: "https://docs.stripe.com/api/idempotent_requests", lastReviewed: reviewedAt },
      { label: "Stripe PaymentIntents", url: "https://docs.stripe.com/payments/payment-intents", lastReviewed: reviewedAt },
      { label: "Stripe refunds", url: "https://docs.stripe.com/refunds", lastReviewed: reviewedAt },
    ],
  },
  {
    id: "chat-bridging.tailscale",
    displayName: "Tailscale",
    capabilityArea: "chat-bridging",
    installerShape: "network-integration",
    providerKind: "connector",
    sourceModel: "mixed",
    recommendationTier: "research-needed",
    recommendationSummary: "Reserved network substrate for a later chat-bridging phase; do not surface as a V1 provider installer.",
    installability: {
      status: "not-installable",
      reason: "Tailscale is reserved for a later chat-bridging integration and has no V1 provider installer.",
      actionLabel: "Reserved",
      actionTitle: "Review reserved Tailscale integration guidance.",
    },
    bestFor: ["Future private chat bridge connectivity", "Stable device naming", "ACL-scoped service reachability"],
    tradeoffs: ["Requires tailnet/account setup", "Network policy design is separate from provider catalog V1"],
    avoidWhen: ["The user is setting up unrelated TTS/search/deep-research providers"],
    platforms: ["macos-arm64", "macos-x64", "windows-x64", "linux-x64"],
    hardwareFit: ["Lightweight client/service"],
    capabilityBuilderDefaults: {
      provider: "Tailscale",
      locality: "network",
      networkHosts: ["*.ts.net"],
    },
    ambientContract: {
      commandContract: "No V1 command contract; reserved for later chat-bridging implementation.",
      descriptorRequirements: ["network-integration card", "ACL/DNS notes", "no V1 installer claim"],
      artifactPolicy: "No artifacts in V1.",
      validationTarget: "Later phase should validate tailnet reachability, MagicDNS/device naming, and ACL boundaries.",
    },
    secrets: [],
    networkHosts: ["*.ts.net"],
    modelAssets: [],
    runtimeState: { externalService: true, serviceKind: "local-daemon", healthCheck: "tailscale status in a future approved integration flow." },
    costPrivacyNotes: ["Tailscale coordination sees metadata, not encrypted tunnel contents; review current security docs during bridge design."],
    maintenanceNotes: ["Do not mix Tailscale setup into provider onboarding until chat bridging is implemented."],
    safetyBoundaries: ["Chat bridging must define auth, ACLs, disclosure boundaries, and bridge lifecycle approval before install."],
    knownQuirks: ["MagicDNS and ACL behavior depend on tailnet configuration."],
    researchStatus: "seeded",
    evidence: [{ date: reviewedAt, type: "docs-review", summary: "Reserved as necessary later-phase chat-bridging integration." }],
    docs: [
      { label: "Tailscale MagicDNS", url: "https://tailscale.com/docs/features/magicdns", lastReviewed: reviewedAt },
      { label: "Tailscale security", url: "https://tailscale.com/security", lastReviewed: reviewedAt },
    ],
  },
];

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
          outputFileArtifacts: entry.capabilityBuilderDefaults.outputFileArtifacts ? [...entry.capabilityBuilderDefaults.outputFileArtifacts] : undefined,
          responseFormats: entry.capabilityBuilderDefaults.responseFormats ? [...entry.capabilityBuilderDefaults.responseFormats] : undefined,
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
  if (appliesTo.requiresSecrets !== undefined && (provider.secrets.length > 0) !== appliesTo.requiresSecrets) return false;
  if (appliesTo.hasModelAssets !== undefined && (provider.modelAssets.length > 0) !== appliesTo.hasModelAssets) return false;
  if (appliesTo.externalService !== undefined && Boolean(provider.runtimeState?.externalService) !== appliesTo.externalService) return false;
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
      lines.push(`  localArtifacts=${provider.localArtifactReadiness.status}; smoke=${provider.localArtifactReadiness.minimumLocalSmokeTest ?? "not declared"}`);
    }
    if (provider.secrets.length) {
      lines.push(`  secrets=${provider.secrets.map((secret) => `${secret.envName}${secret.required ? ":required" : ":optional"}`).join(", ")}`);
    }
    if (provider.runtimeState?.externalService) {
      lines.push(`  runtime=${provider.runtimeState.serviceKind ?? "external"}${provider.runtimeState.updatePolicy ? `; updates=${provider.runtimeState.updatePolicy}` : ""}`);
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

export function validateProviderCatalog(entries: readonly ProviderCatalogEntry[] = providerCatalogEntries): ProviderCatalogValidationResult {
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
      if (entry.installability.actionLabel !== undefined && !entry.installability.actionLabel.trim()) errors.push(`${entry.id} installability actionLabel cannot be empty.`);
      if (entry.installability.actionTitle !== undefined && !entry.installability.actionTitle.trim()) errors.push(`${entry.id} installability actionTitle cannot be empty.`);
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
    if (["voice-generation", "voice-recognition", "web-scraping", "web-search", "retrieval", "deep-research", "image-generation", "video-generation", "rich-documents", "svg-animation", "social-media", "agentic-services"].includes(entry.capabilityArea) && !entry.recommendationMemo) {
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
        if (support.status !== "supported" && !support.caveats.length) warnings.push(`${entry.id} platformSupport ${support.platform} has no caveats for ${support.status} status.`);
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
  ].filter(Boolean).join("\n").toLowerCase();

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
  const raw = input && typeof input === "object" && !Array.isArray(input) ? input as Record<string, unknown> : {};
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
  if (haystack.includes(goal)) return true;
  const tokens = significantGoalTokens(goalText);
  if (!tokens.length) return true;
  const matched = tokens.filter((token) => haystack.includes(token));
  if (tokens.length <= 3) return matched.length === tokens.length;
  return matched.length >= Math.min(3, tokens.length);
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
    ...(entry.recommendationMemo ? [
      entry.recommendationMemo.deploymentRole,
      entry.recommendationMemo.recommendation,
      ...entry.recommendationMemo.fallbackGuidance,
    ] : []),
    ...entry.modelAssets.map((asset) => [asset.name, asset.sourceUrl].filter(Boolean).join(" ")),
    ...(entry.capabilityBuilderDefaults?.modelAssets ?? []),
  ].filter(Boolean).join(" ");
}

function significantGoalTokens(value: string): string[] {
  const stopwords = new Set([
    "a", "an", "and", "are", "as", "be", "before", "by", "can", "choose", "for", "from", "has", "have",
    "how", "i", "in", "is", "it", "known", "knows", "me", "of", "on", "onboard", "or", "please", "provider",
    "providers", "recommend", "setup", "should", "start", "the", "to", "use", "using", "want", "we", "what",
    "whether", "which", "with",
  ]);
  return [...new Set(
    value
      .toLowerCase()
      .split(/[^a-z0-9]+/g)
      .map((token) => token.trim())
      .filter((token) => token.length >= 2 && !stopwords.has(token)),
  )];
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
    case "default": return 0;
    case "recommended": return 1;
    case "conditional": return 2;
    case "experimental": return 3;
    case "research-needed": return 4;
    case "not-recommended": return 5;
  }
}

function researchStatusRank(status: ProviderResearchStatus): number {
  switch (status) {
    case "live-dogfooded": return 4;
    case "credential-tested": return 3;
    case "researched": return 2;
    case "seeded": return 1;
    case "deprecated": return 0;
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
          outputFileArtifacts: entry.capabilityBuilderDefaults.outputFileArtifacts ? [...entry.capabilityBuilderDefaults.outputFileArtifacts] : undefined,
          responseFormats: entry.capabilityBuilderDefaults.responseFormats ? [...entry.capabilityBuilderDefaults.responseFormats] : undefined,
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
