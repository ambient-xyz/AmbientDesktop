import type { ProviderCatalogSettingsCard } from "../../shared/desktopTypes";
import type { VoiceOnboardingHostFacts } from "../../shared/localRuntimeTypes";
import type { AmbientGeneratedCapabilitySummary, AmbientMcpContainerRuntimeInstallAction, AmbientMcpContainerRuntimeLifecycleAction, AmbientMcpContainerRuntimeLifecycleCommand, AmbientMcpContainerRuntimeLifecyclePreview, AmbientMcpContainerRuntimeLifecycleProgress, AmbientMcpContainerRuntimeLifecycleResult, AmbientMcpContainerRuntimeStatus, AmbientMcpContainerRuntimeStatusKind, AmbientMcpDefaultCapabilitySummary, AmbientMcpInstalledServerSummary, AmbientMcpInstallPreview, AmbientMcpServerSearchResult, AmbientPluginAppAuthSummary, AmbientPluginAuthAccountSummary, AmbientPluginCapabilitySummary, AmbientPluginRegistry, AmbientPluginRuntime, AmbientPluginSourceKind, AmbientPluginSummary, CapabilityBuilderHistoryEntry, CodexMarketplaceSourceSummary, CodexPluginSummary, FirstPartyGoogleIntegrationState, PiPackageInstallScope, PiPackageSummary, PluginMcpRuntimeEvent } from "../../shared/pluginTypes";
import type { WorkflowPluginCapabilityGrant } from "../../shared/workflowTypes";
import { welcomeCoreSetupSectionDefinitions } from "./welcomeSetupUiModel";
import { miniCpmRemoteEndpointReviewChecklistText } from "../../shared/miniCpmRemoteEndpointSecurity";

export type AmbientPluginSourceFilter = "all" | AmbientPluginSourceKind;
export type AmbientPluginRuntimeFilter = "all" | AmbientPluginRuntime;

export interface PluginActionState {
  label: string;
  disabled: boolean;
  title: string;
  visible: boolean;
}

export interface McpContainerRuntimeInstallActionView extends PluginActionState {
  actionId: string;
  primary: boolean;
  runtime: AmbientMcpContainerRuntimeInstallAction["runtime"];
  kind: AmbientMcpContainerRuntimeInstallAction["kind"];
  busyLabel: string;
  commandPreview?: string;
  managedExecution?: string;
}

export interface McpContainerRuntimeLifecycleActionView extends PluginActionState {
  action: AmbientMcpContainerRuntimeLifecycleAction;
  primary: boolean;
  danger: boolean;
  busyLabel: string;
}

export type McpContainerRuntimeLifecycleStatusView = {
  kind: "info" | "success" | "error";
  message: string;
};

export const mcpContainerRuntimeLifecycleForceWarningText =
  "Force quit and restart can interrupt every container on this runtime, including non-Ambient containers.";

export interface WorkflowPluginRequirementRow {
  capabilityId: string;
  pluginName: string;
  serverName: string;
  toolName: string;
  registeredName: string;
  availabilityLabel: string;
  availabilityReason?: string;
  blocked: boolean;
}

export interface CodexImportCandidateGroups {
  curated: CodexPluginSummary[];
  remote: CodexPluginSummary[];
  localCache: CodexPluginSummary[];
}

export type CapabilityBuilderLocality = "local" | "network" | "either";
export type RemoteSurfaceActivationPromptProvider = "choose" | "telegram" | "signal";

export interface CapabilityBuilderLauncherDraft {
  goal: string;
  kind: string;
  provider: string;
  outputArtifact: string;
  locality: CapabilityBuilderLocality;
}

export type VoiceProviderGuidanceType = "local" | "cloud" | "custom";
export type VoiceProviderGuidanceTier = "recommended" | "viable" | "advanced" | "experimental";
export type VoiceProviderRecommendationLevel = "recommended-now" | "good-option" | "advanced-only" | "custom-only";

export interface VoiceProviderGuidanceCard {
  id: string;
  label: string;
  type: VoiceProviderGuidanceType;
  tier: VoiceProviderGuidanceTier;
  summary: string;
  bestFor: string;
  tradeoffs: string;
  setupNotes: string;
  envNames?: string[];
  networkHosts?: string[];
  template: "available" | "planned" | "custom";
}

export interface VoiceProviderRecommendation {
  card: VoiceProviderGuidanceCard;
  level: VoiceProviderRecommendationLevel;
  rationale: string;
}

export interface ProviderCatalogSettingsCardView {
  id: string;
  title: string;
  subtitle: string;
  tone: "recommended" | "conditional" | "research";
  meta: string[];
  actionLabel: string;
  actionTitle: string;
}

export type GoogleWorkspaceActionKind = "install" | "connect" | "repair" | "validate" | "cancel";

export type GoogleWorkspaceValidationFeedbackStatus = "validating" | "validated" | "failed";

export interface GoogleWorkspaceValidationFeedback {
  accountId: string;
  status: GoogleWorkspaceValidationFeedbackStatus;
  message?: string;
}

export interface GoogleWorkspaceValidationButtonView {
  label: string;
  icon: "none" | "spinner" | "success" | "error";
  tone: "default" | "success" | "error";
}

export interface GoogleWorkspaceAccountRow {
  id: string;
  accountId: string;
  label: string;
  identityLabel: string;
  handleLabel: string;
  email?: string;
  status: AmbientPluginAuthAccountSummary["status"];
  connectorLabels: string[];
  lastValidatedLabel?: string;
  validationError?: string;
}

export function groupCodexImportCandidates(candidates: CodexPluginSummary[]): CodexImportCandidateGroups {
  return {
    curated: candidates.filter((plugin) => plugin.marketplaceKind === "ambient-curated"),
    remote: candidates.filter((plugin) => plugin.sourceKind === "remote-marketplace" && plugin.marketplaceKind !== "ambient-curated"),
    localCache: candidates.filter((plugin) => plugin.sourceKind === "codex-cache"),
  };
}

export function defaultCapabilityBuilderLauncherDraft(): CapabilityBuilderLauncherDraft {
  return {
    goal: "",
    kind: "",
    provider: "",
    outputArtifact: "",
    locality: "either",
  };
}

export function buildCapabilityBuilderPrompt(draft: CapabilityBuilderLauncherDraft): string {
  const lines = [
    "Create an Ambient capability package.",
    `Goal: ${draft.goal.trim()}`,
    draft.kind.trim() ? `Capability kind: ${draft.kind.trim()}` : undefined,
    draft.provider.trim() ? `Provider/runtime: ${draft.provider.trim()}` : undefined,
    draft.outputArtifact.trim() ? `Output artifact type: ${draft.outputArtifact.trim()}` : undefined,
    `Execution locality: ${draft.locality}`,
    "Use the Capability Builder flow.",
    "First call ambient_capability_builder_plan with these details.",
    "If the goal is assistant voice output, read-aloud chat, chat voicing, or TTS provider setup, use installerShape tts-provider unless I explicitly ask only for one-off audio-file generation.",
    "If a generated package already exists that produces TTS/audio artifacts but is not selectable for chat voicing, route through Capability Builder repair: convert it to installerShape tts-provider before validation, registration, or re-registration.",
    "For ElevenLabs or Cartesia assistant voicing, plan the first-party cloud tts-provider template, Builder-scoped secret capture through ambient_capability_builder_secret_request, exact network host declarations, and one tiny validation synthesis.",
    "Inspect the current host OS, architecture, relevant runtimes, and package managers before choosing an implementation strategy.",
    "If a provider, URL, repo, model, binary, or library is named, read the upstream README/install/example docs first and summarize platform-specific guidance.",
    "Identify platform-specific install/runtime paths, model/download behavior, expected asset sizes when known, license notes, sample inputs/assets needed for smoke tests, and whether local execution is viable.",
    "Plan exact text handling for user-provided text; prefer file-input flags when punctuation, quotes, whitespace, or long text may be hard to pass safely as CLI args.",
    "Plan user-visible artifact output paths; final generated files should not live only inside package internals.",
    "Ask clarifying questions only if required before scaffolding.",
    "Present the viable implementation and dependency-install strategy before any install commands.",
    "Do not scaffold files, install dependencies, register the package, or activate anything until I approve the plan.",
  ].filter((line): line is string => Boolean(line));
  return lines.join("\n");
}

export function buildFirstRunCapabilityOnboardingPrompt(
  hostFacts?: VoiceOnboardingHostFacts,
  catalogCards: readonly ProviderCatalogSettingsCard[] = [],
): string {
  const catalogLines = formatFirstRunProviderCatalogCards(catalogCards);
  return [
    "Ambient first-run capability onboarding request.",
    "Launch source: first-run macro onboarding.",
    "Goal: Help the user choose and set up core Ambient capabilities through chat-first typed installers.",
    "",
    "This is a macro onboarding conversation, not a large Settings wizard and not an install script.",
    "Your first job is to recommend a compact setup sequence, ask one high-level preference question if needed, and then launch typed sub-installers only after the user chooses an area.",
    "Do not scaffold files, install dependencies, bind secrets, activate packages, or run provider code until the user approves the relevant typed sub-installer plan.",
    "Do not search bundled app markdown, .asar internals, source trees, or guessed documentation paths for Ambient contracts; use the installer shapes and contracts provided in this prompt.",
    "",
    "Machine facts:",
    ...formatVoiceOnboardingHostFacts(hostFacts),
    "",
    ...catalogLines,
    ...(catalogLines.length ? [""] : []),
    "Initial setup areas:",
    "- Voice/TTS: use installer shape tts-provider and the voice-generation catalog cards above. Start with the same local/cloud/custom choice flow as Settings Voice Add provider. Recommend Piper for local baseline, ElevenLabs or Cartesia for cloud quality/latency, and custom/advanced only after README and machine-fit inspection.",
    "- Speech input/STT: use installer shape stt-provider and the voice-recognition catalog cards above. Recommend the primary local STT path when the host/runtime facts fit, and distinguish health checks from real microphone/audio validation.",
    "- Search, web, and research: use the web-search, web-scraping, retrieval, and deep-research catalog cards above. Check installed first-party search/browser capabilities before proposing new packages; otherwise plan typed providers with explicit network hosts, secret rules, citation/artifact boundaries, and provider preference behavior.",
    "- Media and vision: use visual-understanding, image-generation, video-generation, and svg-animation catalog cards. MiniCPM-V should use the first-party visual setup path; HyperFrames authored video should use the bundled Ambient CLI package path, not the default Scrapling MCP path.",
    "- Documents and Office: use rich-documents catalog cards and installed connector/document surfaces first, then plan capability packages only when a specific document type or conversion need is not already covered.",
    "- Writing Style: use writing-style-transfer catalog cards. TinyStyler should use the bundled ambient-tinystyler Ambient CLI package path, not prompt-only rewriting and not new Capability Builder scaffolding unless the user asks for a different package.",
    "- MCP runtime and default web research: treat container runtime recovery and the default Scrapling ToolHive capability as core setup. Surface status and setup prompts before any install or runtime mutation.",
    "- Remote access: use Remote Ambient Surface, not Messaging Connector. Start with ambient_messaging_remote_surface_activation_plan for any request to control Ambient through Telegram, Signal, or another messaging provider. Telegram is the reviewed activation route; Signal/other providers should surface unsupported-provider repair/status prompts unless the user explicitly asks to build future provider support.",
    "- Advanced services: social-media, agentic-services, and chat-bridging cards are core product setup when exposed in the provider catalog. Custom team-specific integrations still belong in Plugin Setup.",
    "- API-backed providers and secrets: use Ambient-managed secret flows only. Use ambient_cli_secret_request for Desktop-owned entry or ambient_cli_env_bind for approved workspace-local ignored secret files. Never ask the user to paste, type, reveal, summarize, or confirm API key values in chat.",
    "",
    "Required first response shape:",
    "- Briefly state that setup is optional, skippable, and resumable.",
    "- Recommend a minimal sequence: Voice/TTS first, Search/Web/Research second, MCP runtime/default web research if blocked, Remote access when the user wants owner control from Telegram, and Speech Input/STT when the user wants dictation or hands-free control.",
    "- Present compact choices: Set up voice, Set up speech input, Set up search/web/research, Set up media/vision, Set up documents, Set up writing style, Set up remote access, or Skip/resume later.",
    "- Do not call ambient_capability_builder_plan until the user chooses one setup area or names a specific provider/capability.",
    "",
    "Typed sub-installer handoff rules:",
    "- If the user chooses voice, use the TTS provider onboarding rules and selected voice-generation catalog card ids: provider recommendations, local/cloud/custom choice, Piper fast path, ElevenLabs/Cartesia cloud fast path, and Ambient tts-provider command contract.",
    "- If the user chooses speech input, run ambient_provider_catalog through ambient_tool_search, ambient_tool_describe, and ambient_tool_call with capabilityArea voice-recognition, then use the selected STT catalog card when calling ambient_capability_builder_plan after the user picks or confirms a provider path.",
    "- If the user chooses search/web/research, run ambient_provider_catalog through ambient_tool_search, ambient_tool_describe, and ambient_tool_call for the relevant capability area, check installed search/browser/runtime capabilities when available, and then use the selected catalog card when planning after the user picks or confirms a provider path.",
    "- If the user chooses media/vision, run ambient_provider_catalog through ambient_tool_search, ambient_tool_describe, and ambient_tool_call for visual-understanding, image-generation, video-generation, or svg-animation as appropriate, then follow that catalog card's typed installer contract.",
    "- If the user chooses documents, run ambient_provider_catalog through ambient_tool_search, ambient_tool_describe, and ambient_tool_call with capabilityArea rich-documents and check installed document connector/rich-document surfaces before planning new packages.",
    "- If the user chooses writing style, run ambient_provider_catalog through ambient_tool_search, ambient_tool_describe, and ambient_tool_call with capabilityArea writing-style-transfer, then use the selected catalog card's Ambient CLI package flow after the user picks or confirms a provider path.",
    "- If the user chooses remote access, call ambient_messaging_remote_surface_activation_plan first with the user's provider preference in requestText. If Telegram is selected and the shortcut recommends ambient_messaging_telegram_owner_loop_activation_plan, call that plan next before any lifecycle, directory, owner handoff, binding, polling, command, or relay tools. If Signal or another unsupported provider is selected, surface the unsupported-provider repair/status prompts and stop rather than falling back to generic Messaging Connector, provider UI, shell, browser automation, provider CLIs, provider-specific low-level tools, arbitrary history reads, provider message reads, or provider sends.",
    "- If the user asks for browser automation or document/media conversion, describe current installed capability boundaries first and ask for the concrete browser/profile or file/task type before planning dependencies.",
    "- If the user chooses skip, stop without mutating anything and tell the user they can return to setup later.",
    "",
    "Shared guardrails:",
    "- Prefer typed installer shapes and direct contract injection over product-doc searching.",
    "- Prefer installed first-party capabilities before proposing new package creation.",
    "- All mutation is approval-gated: dependency install, model download, secret bind, validation call, registration, activation, and provider selection.",
    "- Tool wrappers and generated packages must preserve full large outputs as artifacts with bounded previews and exact path/size metadata.",
    "- Validation should use live Ambient/Pi behavior when it is safe and explicitly approved.",
  ].join("\n");
}

export function buildRemoteSurfaceActivationPrompt(provider: RemoteSurfaceActivationPromptProvider = "choose"): string {
  const providerLabel =
    provider === "telegram" ? "Telegram" :
      provider === "signal" ? "Signal" :
        "reviewed provider choice";
  const requestText =
    provider === "telegram" ? "set up Telegram remote control for Ambient Desktop projects" :
      provider === "signal" ? "set up Signal remote control for Ambient Desktop projects" :
        "set up remote control for Ambient Desktop projects";
  const providerSpecificRules =
    provider === "telegram"
      ? [
          "Telegram-specific rule: after the product shortcut returns route_ready, call ambient_messaging_telegram_owner_loop_activation_plan next and follow its returned phase sequence before lifecycle, directory, owner handoff, binding, polling, command, or relay tools.",
          "Do not skip directly to Telegram lifecycle, directory, handoff, binding, polling, command, or relay tools before the product shortcut and Telegram activation plan have established the safe next step.",
        ]
      : provider === "signal"
        ? [
            "Signal-specific rule: if the product shortcut returns unsupported_provider, surface the repair/status prompt in chat and stop.",
            "Do not call Signal low-level tools, Signal Desktop, signal-cli, provider UI, shell, browser automation, provider CLIs, generic Messaging Connector setup, arbitrary history reads, provider message reads, provider sends, or future-provider scaffolding unless the user explicitly asks to build reviewed Signal Remote Ambient Surface support.",
          ]
        : [
            "Provider-choice rule: if the shortcut asks for a reviewed provider choice, offer Telegram as the reviewed route and explain that Signal/other providers need future provider onboarding before Remote Ambient Surface activation.",
            "Do not choose an unsupported provider path by falling back to Messaging Connector, provider UI, shell, browser automation, provider CLIs, provider-specific low-level tools, arbitrary history reads, provider message reads, or provider sends.",
          ];
  return [
    "Ambient Remote Ambient Surface setup request.",
    "Launch source: Settings Remote control.",
    `Provider preference: ${providerLabel}.`,
    `User goal: ${requestText}.`,
    "",
    "First tool requirement:",
    `- Call ambient_messaging_remote_surface_activation_plan first with requestText exactly: ${requestText}`,
    "- Use the returned status, recommendedNextTool, activationPlanFirstTool, repairPrompt, repairPrompts, blockedUntilActivationPlan, previewSendSafety, and safety fields as authoritative.",
    "",
    ...providerSpecificRules,
    "",
    "Safety boundary:",
    "- This is owner-authenticated Remote Ambient Surface setup, not external Messaging Connector chat-with-others.",
    "- Keep provider sends behind explicit preview/apply approval and do not send provider messages during setup planning.",
    "- Do not read provider message bodies or provider history while planning activation.",
    "- Do not use provider desktop UI, shell, browser automation, provider CLIs, or generic messaging tools as fallback setup paths.",
    "- If the route is unsupported or blocked, surface the product shortcut repair/status prompts and ask for the next reviewed action rather than improvising.",
  ].join("\n");
}

export function buildVoiceProviderCapabilityPrompt(
  hostFacts?: VoiceOnboardingHostFacts,
  catalogCards?: readonly ProviderCatalogSettingsCard[],
): string {
  const localCards = voiceProviderGuidanceCards.filter((card) => card.type === "local");
  const cloudCards = voiceProviderGuidanceCards.filter((card) => card.type === "cloud");
  const customCards = voiceProviderGuidanceCards.filter((card) => card.type === "custom");
  const catalogVoiceCards = catalogCards?.length ? catalogCards : undefined;
  const knownProviderLines = catalogVoiceCards
    ? ["Known provider catalog cards:", ...catalogVoiceCards.flatMap(formatProviderCatalogPromptCard)]
    : [
        "Known local/open-source provider cards:",
        ...localCards.flatMap(formatVoiceProviderGuidanceCard),
        "",
        "Known cloud provider cards:",
        ...cloudCards.flatMap(formatVoiceProviderGuidanceCard),
        "",
        "Custom provider path:",
        ...customCards.flatMap(formatVoiceProviderGuidanceCard),
      ];
  return [
    "Ambient provider onboarding request.",
    "Installer shape: tts-provider.",
    "Launch source: Settings Voice Add provider.",
    "User goal: Set up assistant voice output.",
    "",
    "Your first job is to help the user choose a provider path, not to search Ambient's packaged docs.",
    "Do not search bundled app markdown, .asar internals, source trees, or guessed documentation paths for the Ambient voice-provider contract; the contract is included below.",
    "Ask at most one concise choice question before planning unless a missing answer materially affects safety, cost, secrets, provider choice, hardware viability, or validation.",
    "If the user has not already chosen a provider path, your first reply must be a short choice turn, not an install plan and not a research log.",
    "",
    "Machine facts:",
    ...formatVoiceOnboardingHostFacts(hostFacts),
    "",
    "Provider recommendation summary:",
    ...formatVoiceProviderRecommendationSummary(hostFacts),
    "",
    "Required first response shape when no provider is already selected:",
    "- Start with a two-sentence recommendation based on the machine facts and provider summary.",
    "- Present exactly three choices: Local baseline (Piper), Cloud quality/latency (ElevenLabs or Cartesia), and Custom/advanced provider.",
    "- For Local baseline, say you will plan the first-party Piper template after the user chooses it.",
    "- For Cloud quality/latency, ask the user to pick ElevenLabs or Cartesia, then use Ambient-managed secret capture/binding before validation.",
    "- For Custom/advanced, ask for the repo/API/model if missing and inspect README/install docs plus machine fit before planning.",
    "- Do not call ambient_capability_builder_plan until the user has selected one of these paths or already named a specific provider in the current request.",
    "",
    "Path handling after the user chooses:",
    "- Local baseline or Piper: immediately call ambient_capability_builder_plan for the Piper tts-provider template with locality local and WAV output.",
    "- Kokoro ONNX: immediately call ambient_capability_builder_plan for the first-party Kokoro ONNX tts-provider template with locality local, WAV output, explicit modelAssets, and the dogfooded uv/kokoro-onnx/soundfile runtime path.",
    "- ElevenLabs: call ambient_capability_builder_plan with installerShape tts-provider, locality network, MP3/WAV output, ELEVENLABS_API_KEY, api.elevenlabs.io, secret-flow notes, and a tiny synthesis validation.",
    "- Cartesia: call ambient_capability_builder_plan with installerShape tts-provider, locality network, WAV/MP3 output, CARTESIA_API_KEY, api.cartesia.ai, secret-flow notes, and a tiny synthesis validation.",
    "- Custom/advanced: before planning, inspect upstream README/install/example docs and restate machine viability, dependency risk, model size, license notes, and validation strategy.",
    "- Existing generated TTS/audio artifact package: do not validate, register, or re-register it as-is for chat voicing. First call ambient_capability_builder_repair_plan with requestedRepair exactly: Convert this TTS artifact generator into an Ambient tts-provider for chat voicing.",
    "",
    "Piper fast path requirements:",
    "- Use the first-party Piper tts-provider scaffold/template when the user chooses Local baseline or Piper.",
    "- Plan these modelAssets explicitly: en_US-lessac-medium.onnx from https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/lessac/medium/en_US-lessac-medium.onnx, expected size about 63,100,000 bytes, cache path models/en_US-lessac-medium.onnx; en_US-lessac-medium.onnx.json from https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/lessac/medium/en_US-lessac-medium.onnx.json, expected size about 6,000 bytes, cache path models/en_US-lessac-medium.onnx.json; license note Piper voice model repository terms.",
    "- Separate the preview into runtime install/use of uvx --from piper-tts piper and model asset downloads from Hugging Face.",
    "- Health check must fail clearly when model assets are missing and tell the user to download descriptor modelAssets into ./models before synthesis.",
    "- Validation must generate a real WAV through Ambient's registered provider path, refresh provider discovery, then select/enable the provider only after validation succeeds.",
    "",
    "Kokoro ONNX fast path requirements:",
    "- Use the first-party Kokoro ONNX tts-provider scaffold/template when the user chooses Kokoro ONNX or wants a higher-quality local option that is still dogfooded.",
    "- Plan these modelAssets explicitly: kokoro-v1.0.int8.onnx from https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/kokoro-v1.0.int8.onnx, expected size 92,361,271 bytes, cache path models/kokoro-v1.0.int8.onnx; voices-v1.0.bin from https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/voices-v1.0.bin, expected size 28,214,398 bytes, cache path models/voices-v1.0.bin; license note Kokoro ONNX model/voice release terms.",
    "- Separate the preview into runtime install/use of uv run --with kokoro-onnx --with soundfile python ./scripts/synthesize.py and model asset downloads from GitHub release assets.",
    "- Warn that Kokoro ONNX should synthesize short chunks: keep validation text tiny and keep assistant voice chunks around 1,000 characters or less until the wrapper enforces a safer split below the observed 510-phoneme boundary.",
    "- Health check must fail clearly when model assets are missing and tell the user to download descriptor modelAssets into ./models before synthesis.",
    "- Validation must generate a real WAV through Ambient's registered provider path, refresh provider discovery, then select/enable the provider only after validation succeeds.",
    "",
    "Cloud provider fast path requirements:",
    "- For ElevenLabs, plan envNames ELEVENLABS_API_KEY, networkHosts api.elevenlabs.io, output formats mp3 and wav when supported by the wrapper, and a tiny validation request to POST /v1/text-to-speech/{voiceId} with output_format mp3_44100_128 or a WAV equivalent.",
    "- For Cartesia, plan envNames CARTESIA_API_KEY, networkHosts api.cartesia.ai, output formats wav and mp3 when supported by the wrapper, and a tiny validation request to POST /tts/bytes with Cartesia-Version, model_id, voice id, transcript, and output_format.",
    "- For Builder-managed drafts before registration, use ambient_capability_builder_secret_request for Desktop-owned key entry. Use ambient_cli_secret_request or ambient_cli_env_bind only after a package is installed/registered. Never ask the user to paste, type, reveal, summarize, or confirm API key values in chat.",
    "- Secret values must not appear in descriptors, logs, artifacts, stdout, stderr, validation summaries, Pi-visible tool args/results, or final answers.",
    "- Cloud health checks should verify required env bindings and provider reachability without expensive synthesis; full validation should use one tiny approved synthesis and write audio to a managed output file.",
    "- Cloud wrappers must keep stdout to concise JSON metadata such as audioPath, mimeType, durationMs, providerId, and voiceId; never put base64 audio or large provider responses in stdout.",
    "",
    "Default recommendation policy:",
    "- If the user wants local/offline or is unsure, recommend Piper as the reliable local baseline on typical laptops.",
    "- If the user wants premium quality, low latency, or does not mind API keys/network use, offer ElevenLabs or Cartesia as cloud choices.",
    "- Treat heavier local research stacks as advanced/custom unless the host hardware and upstream docs make the install path clearly viable.",
    "- Always be explicit about local vs cloud tradeoffs: privacy/offline/cost vs quality/latency/API-key/network.",
    "",
    ...knownProviderLines,
    "",
    "Ambient tts-provider contract:",
    "- Capability kind / installerShape: tts-provider.",
    "- The package should expose a tts-provider capability for Ambient core voice dispatch, not require Pi to call ambient_cli for every spoken reply.",
    "- Command contract: accept --text <text>, --output <path>, --format <wav|mp3|ogg>, and optional --voice <id>.",
    "- Write audio to the requested output path and return concise JSON metadata such as audioPath, mimeType, and optional durationMs.",
    "- Declare voiceProvider metadata: label, formats, defaultFormat, voices, and local/cloud flag.",
    "- Declare a health check that verifies runtime and required assets without expensive synthesis.",
    "- Declare modelAssets for local model downloads with URLs, expected sizes when known, license notes, and cache paths.",
    "- Declare env names and exact networkHosts for cloud/API providers.",
    "- Use Ambient-managed secret flows for cloud/API keys: ambient_capability_builder_secret_request for Builder-managed drafts before registration, or ambient_cli_secret_request / ambient_cli_env_bind for installed packages.",
    "- Never ask the user to paste API keys into chat and never expose secret values in descriptors, logs, artifacts, stdout, or Pi-visible tool args/results.",
    "- Do not put large audio or transcripts in stdout; audio must be a managed file artifact.",
    "",
    "Capability Builder rules:",
    "- First call ambient_capability_builder_plan with installerShape tts-provider, outputFileArtifacts WAV or MP3/WAV as appropriate, locality local/network/either, envNames/networkHosts/modelAssets when known, and notes reflecting the selected provider path.",
    "- When scaffolding after approval, pass installerShape tts-provider again. Do not downgrade voice setup to kind artifact generator just because the provider writes MP3/WAV files.",
    "- Once the user approves a known provider template/runtime path, preserve that implementation path through scaffold, dependency install, repair, validation, and registration.",
    "- Do not switch runtimes, SDKs, model formats, package families, API vendors, or major install strategy merely because upstream docs or search results appear simpler. Treat them as references for the selected path unless the user approves an explicit switch proposal.",
    "- If preview/history shows an existing generated package that looks like TTS/audio output but lacks tts-provider shape or voiceProvider metadata, repair it into the tts-provider contract before validation or registration.",
    "- Inspect current host OS, architecture, relevant runtimes, package managers, and upstream README/install/example docs before choosing dependencies for any named provider, repo, model, binary, or library.",
    "- Present the viable implementation, dependency install, model download, secret, network, artifact, health-check, and validation strategy before any install commands.",
    "- Do not scaffold files, install dependencies, validate, register, activate, bind secrets, or run provider code until the user approves the relevant step.",
    "- After registration, validate through Ambient's provider path and refresh provider discovery before saying setup is complete.",
  ].join("\n");
}

export function providerCatalogSettingsCardsForArea(
  cards: readonly ProviderCatalogSettingsCard[],
  capabilityArea: string,
): ProviderCatalogSettingsCard[] {
  return cards.filter((card) => card.capabilityArea === capabilityArea);
}

export function providerCatalogSettingsCardView(card: ProviderCatalogSettingsCard): ProviderCatalogSettingsCardView {
  const providerType = [card.providerKind, card.sourceModel].filter(Boolean).join(" / ");
  const installability = providerCatalogCardInstallability(card);
  const installable = installability.status !== "not-installable";
  return {
    id: card.id,
    title: card.displayName,
    subtitle: card.recommendationSummary,
    tone:
      card.recommendationTier === "recommended" || card.recommendationTier === "default"
        ? "recommended"
        : card.recommendationTier === "research-needed" || card.recommendationTier === "experimental"
          ? "research"
          : "conditional",
    meta: [
      card.deploymentRole ? `role ${card.deploymentRole}` : undefined,
      providerType || undefined,
      card.installerShape,
      installable ? undefined : "not installable",
      card.firstPartyTemplate?.available ? "first-party template" : undefined,
      card.secrets.length ? `secrets ${card.secrets.map((secret) => secret.envName).join(", ")}` : undefined,
      card.networkHosts.length ? `hosts ${card.networkHosts.join(", ")}` : undefined,
    ].filter((item): item is string => Boolean(item)),
    actionLabel: installable ? "Set up" : (installability.actionLabel ?? "Review"),
    actionTitle: installable
      ? `Start provider setup for ${card.displayName}`
      : (installability.actionTitle ?? `Review non-installable provider guidance for ${card.displayName}`),
  };
}

function providerCatalogCardInstallability(card: ProviderCatalogSettingsCard): NonNullable<ProviderCatalogSettingsCard["installability"]> {
  return card.installability ?? {
    status: "installable",
    reason: "This provider catalog card can enter its typed setup flow after user approval.",
  };
}

export function buildProviderCatalogCardOnboardingPrompt(
  card: ProviderCatalogSettingsCard,
  hostFacts?: VoiceOnboardingHostFacts,
): string {
  return [
    "Ambient provider catalog onboarding request.",
    "Launch source: Settings provider catalog card.",
    `Selected catalog card id: ${card.id}.`,
    `Selected provider: ${card.displayName}.`,
    `Capability area: ${card.capabilityArea}.`,
    card.installerShape ? `Installer shape: ${card.installerShape}.` : undefined,
    `Provider kind: ${card.providerKind}.`,
    `Source model: ${card.sourceModel}.`,
    `Recommendation tier: ${card.recommendationTier}.`,
    `Installability: ${providerCatalogCardInstallability(card).status}.`,
    `Installability reason: ${providerCatalogCardInstallability(card).reason}`,
    card.deploymentRole ? `Deployment role: ${card.deploymentRole}.` : undefined,
    `Recommendation summary: ${card.recommendationSummary}`,
    card.recommendation ? `Recommendation memo: ${card.recommendation}` : undefined,
    "",
    "Selected catalog card details:",
    ...formatCatalogCardList("Best for", card.bestFor),
    ...formatCatalogCardList("Tradeoffs", card.tradeoffs),
    ...formatCatalogCardList("Avoid when", card.avoidWhen),
    ...formatCatalogCardList("Platforms", card.platforms),
    ...(card.platformSupport?.length ? formatCatalogCardList("Platform support", formatProviderCatalogPlatformSupport(card.platformSupport)) : []),
    ...formatCatalogCardList("Hardware fit", card.hardwareFit),
    ...formatCatalogCardList("Cost/privacy", card.costPrivacyNotes),
    ...formatCatalogCardList("Known quirks", card.knownQuirks),
    ...formatCatalogCardList("Safety boundaries", card.safetyBoundaries),
    "",
    "Machine facts:",
    ...formatVoiceOnboardingHostFacts(hostFacts),
    "",
    "Ambient contract:",
    card.ambientContract.commandContract ? `- Command contract: ${card.ambientContract.commandContract}` : undefined,
    ...card.ambientContract.descriptorRequirements.map((requirement) => `- Descriptor requirement: ${requirement}`),
    `- Artifact policy: ${card.ambientContract.artifactPolicy}`,
    `- Validation target: ${card.ambientContract.validationTarget}`,
    "",
    providerCatalogCardInstallability(card).status === "not-installable" ? "Non-installable catalog hints:" : "Capability Builder defaults:",
    card.capabilityBuilderDefaults?.provider ? `- Provider: ${card.capabilityBuilderDefaults.provider}` : undefined,
    card.capabilityBuilderDefaults?.locality ? `- Locality: ${card.capabilityBuilderDefaults.locality}` : undefined,
    card.capabilityBuilderDefaults?.outputFileArtifacts?.length ? `- Output file artifacts: ${card.capabilityBuilderDefaults.outputFileArtifacts.join(", ")}` : undefined,
    card.capabilityBuilderDefaults?.responseFormats?.length ? `- Response formats: ${card.capabilityBuilderDefaults.responseFormats.join(", ")}` : undefined,
    card.capabilityBuilderDefaults?.envNames?.length ? `- Env names: ${card.capabilityBuilderDefaults.envNames.join(", ")}` : undefined,
    card.capabilityBuilderDefaults?.networkHosts?.length ? `- Network hosts: ${card.capabilityBuilderDefaults.networkHosts.join(", ")}` : undefined,
    card.capabilityBuilderDefaults?.modelAssets?.length ? `- Model assets: ${card.capabilityBuilderDefaults.modelAssets.join(", ")}` : undefined,
    card.firstPartyTemplate?.available ? `- First-party template: ${card.firstPartyTemplate.templateId ?? "available"}` : undefined,
    "",
    card.secrets.length ? "Secrets:" : undefined,
    ...card.secrets.map((secret) => `- ${secret.envName}: ${secret.required ? "required" : "optional"} via ${secret.capture}`),
    card.modelAssets.length ? "Model assets:" : undefined,
    ...card.modelAssets.map((asset) =>
      [
        `- ${asset.name}`,
        asset.expectedSize ? `size ${asset.expectedSize}` : undefined,
        asset.cachePolicy ? `cache ${asset.cachePolicy}` : undefined,
        asset.licenseNote ? `license ${asset.licenseNote}` : undefined,
      ].filter(Boolean).join("; "),
    ),
    "",
    "Required flow:",
    ...providerCatalogCardRequiredFlow(card),
    "- Settings did not install anything. Do not scaffold files, install dependencies, download models, bind secrets, validate, register, activate, select, or call provider APIs until the user approves the relevant setup step.",
    "- Use Ambient-managed secret flows only. Never ask the user to paste, type, reveal, summarize, or confirm API key values in chat.",
    "- Keep user-facing output concise: state the selected provider, the main tradeoff, the first validation target, and the approval-gated next step.",
  ].filter((line): line is string => Boolean(line)).join("\n");
}

function providerCatalogCardRequiredFlow(card: ProviderCatalogSettingsCard): string[] {
  const catalogRefresh = `- First use ambient_tool_search, ambient_tool_describe, and ambient_tool_call to run ambient_provider_catalog with capabilityArea ${card.capabilityArea}, installerShape ${card.installerShape ?? "unspecified"}, goal mentioning ${card.id} and ${card.displayName}, and a small limit, so the current catalog source is refreshed before planning.`;
  const installability = providerCatalogCardInstallability(card);
  if (installability.status === "not-installable") {
    return [
      catalogRefresh,
      `- This catalog card is not installable: ${installability.reason}`,
      "- Do not call ambient_capability_builder_plan, ambient_capability_builder_scaffold, ambient_capability_builder_install_deps, ambient_capability_builder_validate, ambient_capability_builder_register, ambient_cli_package_install, package-manager install commands, provider registration tools, or provider activation/selection tools for this card.",
      "- Do not claim installed-provider status, generated-package status, registration, activation, or completion. Treat this as read-only guidance unless the user explicitly asks to build a different reviewed installable alternative.",
      ...(card.providerKind === "browser-mediated"
        ? [
            "- For browser-mediated cards, use existing approved browser/web research status and describe tools such as web_research_status before any smoke. If a smoke is useful, propose one tiny visible browser-mediated validation and wait for user approval.",
            "- Prefer installable API-backed or first-party alternatives from the catalog when the user asks for background/default provider routing.",
          ]
        : []),
      "- If the user wants a real install path, refresh the catalog for installable alternatives in the same capability area and present those options instead of adapting this non-installable card.",
    ];
  }
  if (card.id === "video.hyperframes-authored-motion" || card.id === "svg.hyperframes") {
    return [
      catalogRefresh,
      "- Then use Ambient CLI standard discovery: call ambient_cli_search for packageName ambient-hyperframes or query HyperFrames authored motion video, call ambient_cli_describe for packageName ambient-hyperframes, then use ambient_cli commands from that description.",
      "- Start with hyperframes_doctor. If blocked, run hyperframes_setup_plan and present the approval-gated dependency action; do not install FFmpeg, browser runtime, Node, or npm packages silently.",
      "- For the first useful path, run hyperframes_init for a workspace project, hyperframes_inspect on the source, and hyperframes_render only after readiness is clear or the user intentionally approves the required setup.",
      "- Do not route HyperFrames through Capability Builder scaffolding or the Scrapling/default MCP capability lane unless the user explicitly asks to build a different custom package.",
    ];
  }
  if (card.id === "writing.tinystyler") {
    return [
      catalogRefresh,
      "- Then use Ambient CLI standard discovery: call ambient_cli_search for packageName ambient-tinystyler or query TinyStyler writing style transfer, call ambient_cli_describe for packageName ambient-tinystyler, then use ambient_cli commands from that description.",
      "- Start with tinystyler_doctor --json. If the real model cache or dependencies are missing, present the approval-gated setup need and do not silently fall back to prompt-only rewriting.",
      "- For the first useful validation path, create one tiny profile with tinystyler_profile, then run tinystyler_transfer on one short workspace file and verify the profile JSON path and output TXT path.",
      "- Keep raw user examples out of chat and artifacts unless the user explicitly asks for raw-text retention; profile artifacts should persist embeddings and aggregate counts by default.",
      "- Do not route TinyStyler through Capability Builder scaffolding unless the user explicitly asks to build a different custom style-transfer package.",
    ];
  }
  if (card.capabilityArea === "visual-understanding" || card.installerShape === "vision-analysis-provider") {
    return [
      catalogRefresh,
      "- For MiniCPM-V provider setup, use ambient_visual_minicpm_setup with action install, validate, repair, stop, or uninstall after the user approves setup; the tool is already scoped to provider minicpm-v, so do not add an extra provider argument or fall back to raw ambient_cli for ordinary setup.",
      "- Treat the returned runtimeContract as authoritative for packaging status: current macOS/Linux support can use the default managed runtime download, a user-approved local archive after checksum installation, a user-managed llama-server, or an approved local endpoint; Windows default download remains disabled until separate Windows evidence lands.",
      `- For advanced existing-endpoint setup, pass endpointUrl only when the user approved a local localhost/127.0.0.1/[::1] endpoint, include validationImagePath where possible, and do not use remote endpoints until the separate security-reviewed hosted path covers ${miniCpmRemoteEndpointReviewChecklistText()}.`,
      "- For validation or user-requested visual inspection, use ambient_visual_analyze with a bounded workspace screenshot, approved image path, or video/videoPath plus frameTimestampMs for a short sampled clip; use a task preset such as ui_review, screenshot_ocr, game_visual_review, image_description, design_comparison, or video_frame_review, and a workspace-relative output artifact path.",
      "- Use the typed visual tool result and artifact metadata before claiming active state. Only use Capability Builder repair if the first-party visual adapter/package contract itself needs an explicit approved repair.",
    ];
  }
  if (card.id === "deep.literesearcher-4b" || card.firstPartyTemplate?.templateId === "local-deep-research:literesearcher-llamacpp") {
    return [
      catalogRefresh,
      "- Use the first-party Local Deep Research setup flow: call ambient_local_deep_research_setup with action status or validate first to inspect managed model/runtime state, selected Q4/Q8 profile, memory policy, provider snapshot, validation evidence, and next actions.",
      "- After the user approves setup changes, use ambient_local_deep_research_setup with action install or repair for managed LiteResearcher GGUF and shared llama.cpp runtime assets; do not scaffold a custom Capability Builder package for this first-party path.",
      "- After setup is ready, use ambient_local_deep_research_setup with action smoke when local runtime evidence is needed, then use ambient_local_deep_research_run for bounded mixed-source research tasks.",
      "- Preserve the user's current Search & Web provider preferences: Local Deep Research resolves search/fetch providers at run start and records the provider snapshot; provider preference changes apply to the next run without reinstalling the model.",
      "- Keep Q8 as high-memory/default-on-workstation or explicit advanced override with memory preflight. Use Q4 fallback and 8k safe mode when setup reports memory pressure.",
      "- Inspect run artifacts before claiming completion: model profile, context tokens, provider snapshot, tool executions, source URLs, final report, and citationValidation.status must support the claim.",
      "- Do not call ambient_capability_builder_plan, scaffold generated packages, bind upstream Serper/Scrape.do keys, or bypass Ambient search/fetch routing for the first-party Local Deep Research path.",
    ];
  }
  return [
    catalogRefresh,
    "- Then call ambient_capability_builder_plan for this selected card, passing the installer shape, provider, locality, env names, network hosts, model assets, output artifacts, and validation target from the catalog card where they apply.",
    "- Use installed-provider status tools before claiming active state: ambient_voice_status for TTS, ambient_stt_status for STT, and ambient_search_preference_status or ambient_cli_search for search providers.",
    "- If a generated package already exists but does not satisfy the selected installer shape and Ambient contract, use the Capability Builder repair flow before validation or registration.",
  ];
}

export const voiceProviderGuidanceCards: VoiceProviderGuidanceCard[] = [
  {
    id: "piper",
    label: "Piper",
    type: "local",
    tier: "recommended",
    summary: "Reliable offline baseline with small ONNX voice models and predictable WAV output.",
    bestFor: "First local setup, privacy/offline use, low install risk, and quick validation.",
    tradeoffs: "Less expressive than premium cloud voices or larger neural TTS systems.",
    setupNotes: "Use the first-party Piper tts-provider template when selected; declare lessac or another voice model as modelAssets.",
    template: "available",
  },
  {
    id: "kokoro-mlx",
    label: "Kokoro / MLX TTS",
    type: "local",
    tier: "advanced",
    summary: "Higher-quality local candidate for Apple Silicon when MLX/Python dependencies are healthy.",
    bestFor: "Mac users who want better local quality and accept more dependency/model complexity.",
    tradeoffs: "More fragile than Piper; fresh uv-based mlx-audio dogfood found hidden text-processing deps and a NumPy/Thinc ABI failure before synthesis.",
    setupNotes: "Inspect upstream README first, prefer MLX-native Apple Silicon paths, and plan a pinned Python environment for Kokoro text processing deps such as misaki, num2words, and spaCy before model download.",
    template: "planned",
  },
  {
    id: "mlx-audio",
    label: "mlx-audio",
    type: "local",
    tier: "viable",
    summary: "Apple Silicon-oriented local audio/TTS lane worth considering for MLX-friendly models.",
    bestFor: "Apple Silicon hosts where local acceleration matters.",
    tradeoffs: "Model support and wrapper contract may vary; Kokoro via mlx-audio is promising but needs pinned dependency planning after fresh dogfood exposed misaki/spaCy/NumPy friction.",
    setupNotes: "Confirm model choice, model size, CLI/API path, optional text-processing dependencies, and a tiny synthesis smoke command before dependency installation.",
    template: "planned",
  },
  {
    id: "kokoro-onnx",
    label: "Kokoro ONNX",
    type: "local",
    tier: "viable",
    summary: "Lightweight local Kokoro path using ONNX Runtime and explicit model/voice assets.",
    bestFor: "Mac users who want better-than-Piper local quality without the MLX/Kokoro Python text-processing stack.",
    tradeoffs: "Requires model and voices asset downloads; quality/voice choices depend on the selected Kokoro ONNX release and voice pack; long text should be chunked below the observed 510-phoneme boundary.",
    setupNotes: "Dogfood succeeded with kokoro-v1.0.int8.onnx plus voices-v1.0.bin, uv run --with kokoro-onnx --with soundfile, and a tiny WAV smoke test at 24 kHz mono. Keep validation text tiny and assistant voice chunks around 1,000 characters or less until the wrapper enforces a safer split.",
    template: "planned",
  },
  {
    id: "pure-c-voxtral",
    label: "Pure-C Voxtral-style local TTS",
    type: "local",
    tier: "advanced",
    summary: "Low-friction native/local lane when a small compiled runtime is available.",
    bestFor: "Users who want local execution without a large Python stack.",
    tradeoffs: "Provider maturity and voice quality may vary; upstream docs must be inspected.",
    setupNotes: "Prefer released binaries on matching OS/arch; avoid compiling unless previewed and approved.",
    template: "custom",
  },
  {
    id: "neutts",
    label: "NeuTTS",
    type: "local",
    tier: "advanced",
    summary: "Useful stress-case local neural TTS provider with platform-specific install concerns.",
    bestFor: "Users who explicitly want NeuTTS and accept debugging, model downloads, and custom setup.",
    tradeoffs: "Can be brittle on fresh installs; must read README and platform-specific binary guidance first.",
    setupNotes: "Align on macOS/Apple Silicon support and available binaries before dependency installation.",
    template: "custom",
  },
  {
    id: "chatterbox",
    label: "Chatterbox",
    type: "local",
    tier: "advanced",
    summary: "Resemble AI open-source TTS family with voice cloning and multilingual variants.",
    bestFor: "Users who want higher-quality local voice cloning or emotion control and accept Python/model complexity.",
    tradeoffs: "Likely heavier than Piper and may need accelerator-specific dependency choices; cloud-hosted Resemble options must be treated separately from local open-source setup.",
    setupNotes: "Inspect resemble-ai/chatterbox README, model license, voice/reference-audio requirements, and CPU/GPU viability before planning installs.",
    template: "custom",
  },
  {
    id: "f5-tts",
    label: "F5-TTS",
    type: "local",
    tier: "advanced",
    summary: "Flow-matching open-source TTS candidate commonly used for zero-shot/local voice workflows.",
    bestFor: "Advanced users who want open local voice cloning with reference audio and can tolerate model/runtime setup.",
    tradeoffs: "Install/runtime path can vary across forks and environments; output quality and latency depend heavily on model choice and hardware.",
    setupNotes: "Inspect SWivid/F5-TTS docs, model assets, reference-audio requirements, output API, and sample smoke-test command before installation.",
    template: "custom",
  },
  {
    id: "fish-speech",
    label: "Fish-Speech",
    type: "local",
    tier: "advanced",
    summary: "Multilingual open-source TTS and voice-cloning system from Fish Audio.",
    bestFor: "Advanced users who need multilingual/local cloning and are comfortable with larger model dependencies.",
    tradeoffs: "Model downloads and serving stack may be substantial; check license, hardware, and exact inference API before planning.",
    setupNotes: "Inspect fishaudio/fish-speech README, model cards, VRAM/RAM needs, and CLI/server validation path before dependency installation.",
    template: "custom",
  },
  {
    id: "cosyvoice",
    label: "CosyVoice",
    type: "local",
    tier: "advanced",
    summary: "Multilingual zero-shot TTS family with richer control surfaces and production-style serving options.",
    bestFor: "Advanced users who need multilingual/local voice cloning and accept a heavier Python/Docker-style stack.",
    tradeoffs: "Dependency footprint is larger than Piper/Kokoro; may require Conda/Docker/model downloads and careful license review.",
    setupNotes: "Inspect FunAudioLLM/CosyVoice docs, supported model variant, serving mode, model size, and smoke-test audio generation before installation.",
    template: "custom",
  },
  {
    id: "indextts",
    label: "IndexTTS",
    type: "local",
    tier: "advanced",
    summary: "Industrial-style controllable zero-shot TTS system with multilingual/emotional variants.",
    bestFor: "Advanced users exploring controllable local voice cloning with explicit model/version requirements.",
    tradeoffs: "Can be model-heavy and version-sensitive; fit depends on upstream install path, reference audio handling, and hardware.",
    setupNotes: "Inspect IndexTTS repository/docs, model version, language support, expected assets, and CLI/API smoke path before planning installs.",
    template: "custom",
  },
  {
    id: "orpheus",
    label: "Orpheus TTS",
    type: "local",
    tier: "experimental",
    summary: "Expressive local TTS candidate focused on natural/emotive speech.",
    bestFor: "Users explicitly exploring expressive local speech and willing to validate current model availability.",
    tradeoffs: "Project packaging and model variants may be volatile; require README and release verification before any install.",
    setupNotes: "Inspect canopyai/Orpheus-TTS or the chosen maintained fork, model availability, runtime requirements, and minimal smoke command first.",
    template: "custom",
  },
  {
    id: "vibevoice",
    label: "VibeVoice",
    type: "local",
    tier: "experimental",
    summary: "Microsoft open-source voice model family aimed at long-form and multi-speaker audio generation.",
    bestFor: "Users who want podcast-style, long-form, or multi-speaker generated audio rather than low-latency assistant replies.",
    tradeoffs: "Not a default assistant-voice provider; likely higher latency and larger model/runtime needs than short-form TTS providers.",
    setupNotes: "Inspect microsoft/VibeVoice docs, model size, language limits, long-form artifact handling, and whether it can satisfy the tts-provider short-text contract before installation.",
    template: "custom",
  },
  {
    id: "voxcpm",
    label: "VoxCPM",
    type: "local",
    tier: "advanced",
    summary: "Research-grade local TTS/voice model candidate.",
    bestFor: "Advanced users with suitable hardware and tolerance for larger model/runtime setup.",
    tradeoffs: "Likely heavier than Piper/Kokoro; may need GPU/model-specific dependencies.",
    setupNotes: "Inspect model size, license, accelerator assumptions, and smoke-test path before install.",
    template: "custom",
  },
  {
    id: "qwen3-tts",
    label: "Qwen3-TTS",
    type: "local",
    tier: "experimental",
    summary: "Large-model local TTS candidate for advanced hardware and experimentation.",
    bestFor: "Users explicitly exploring high-capability local model TTS.",
    tradeoffs: "Potentially large downloads, slow CPU performance, and nontrivial runtime requirements.",
    setupNotes: "Do not recommend as the default laptop path; require explicit user choice and viability planning.",
    template: "custom",
  },
  {
    id: "mimo-voice",
    label: "MiMo Voice/TTS",
    type: "local",
    tier: "experimental",
    summary: "Experimental local/research voice stack candidate.",
    bestFor: "Custom provider dogfood and advanced local experimentation.",
    tradeoffs: "Unknown install friction until upstream docs and host support are inspected.",
    setupNotes: "Treat as custom unless a stable CLI/API, model assets, and smoke test are identified.",
    template: "custom",
  },
  {
    id: "elevenlabs",
    label: "ElevenLabs",
    type: "cloud",
    tier: "recommended",
    summary: "High-quality cloud TTS with straightforward API-key authentication.",
    bestFor: "Premium voice quality and fast setup when network/API-key use is acceptable.",
    tradeoffs: "Requires account, API key, network calls, and metered provider usage.",
    setupNotes: "Declare ELEVENLABS_API_KEY and api.elevenlabs.io; use Ambient secret binding, never chat-pasted keys.",
    envNames: ["ELEVENLABS_API_KEY"],
    networkHosts: ["api.elevenlabs.io"],
    template: "planned",
  },
  {
    id: "cartesia",
    label: "Cartesia",
    type: "cloud",
    tier: "recommended",
    summary: "Low-latency, high-quality cloud voice API candidate.",
    bestFor: "Fast cloud synthesis and real-time-feeling voice output.",
    tradeoffs: "Requires account, API key, network calls, and provider cost/limits.",
    setupNotes: "Declare CARTESIA_API_KEY and api.cartesia.ai; validate with a tiny approved synthesis request.",
    envNames: ["CARTESIA_API_KEY"],
    networkHosts: ["api.cartesia.ai"],
    template: "planned",
  },
  {
    id: "openai-speech",
    label: "OpenAI speech",
    type: "cloud",
    tier: "viable",
    summary: "Cloud TTS option when an OpenAI API key and product posture are appropriate.",
    bestFor: "Users already using OpenAI APIs who want a familiar cloud provider.",
    tradeoffs: "Requires API key, network calls, provider cost, and model/voice selection.",
    setupNotes: "Declare OPENAI_API_KEY and api.openai.com; keep separate from Ambient provider credentials unless explicitly approved.",
    envNames: ["OPENAI_API_KEY"],
    networkHosts: ["api.openai.com"],
    template: "planned",
  },
  {
    id: "custom",
    label: "Custom repo/API/model",
    type: "custom",
    tier: "advanced",
    summary: "Exploratory path for a user-specified provider not in the known catalog.",
    bestFor: "Specific repos, models, APIs, or binaries the user explicitly wants.",
    tradeoffs: "Higher uncertainty; requires upstream docs, host viability check, and stricter validation before registration.",
    setupNotes: "Use the same tts-provider contract, but label the path as custom and plan before any install.",
    template: "custom",
  },
];

function formatCatalogCardList(label: string, values: readonly string[]): string[] {
  if (!values.length) return [`- ${label}: none declared`];
  return [`- ${label}: ${values.join("; ")}`];
}

function formatProviderCatalogPlatformSupport(
  support: ProviderCatalogSettingsCard["platformSupport"] | undefined,
): string[] {
  return (support ?? []).map((row) => {
    const caveat = row.caveats[0] ? `; caveat ${row.caveats[0]}` : "";
    return `${row.platform}: ${row.status}; runtime ${row.runtime}; install ${row.installMode}; evidence ${row.evidence.join(", ")}${caveat}`;
  });
}

function formatFirstRunProviderCatalogCards(cards: readonly ProviderCatalogSettingsCard[]): string[] {
  if (!cards.length) return [];
  const groups: Array<[string, string[]]> = [
    ...welcomeCoreSetupSectionDefinitions.map((definition): [string, string[]] => [
      `${definition.title} catalog cards`,
      definition.capabilityAreas,
    ]),
  ];
  const lines = groups.flatMap(([label, capabilityAreas]) => {
    const areaCards = cards.filter((card) => capabilityAreas.includes(card.capabilityArea));
    if (!areaCards.length) return [`${label}: none exposed in the shared provider catalog.`];
    return [`${label}:`, ...areaCards.flatMap(formatProviderCatalogPromptCard)];
  });
  return [
    "Catalog-backed setup cards:",
    ...lines,
    "- Use these card ids as the source of provider recommendations and typed sub-installer defaults; do not invent a separate first-run recommendation list.",
  ];
}

function formatProviderCatalogPromptCard(card: ProviderCatalogSettingsCard): string[] {
  const details = [
    `kind: ${card.providerKind}`,
    `source: ${card.sourceModel}`,
    card.installerShape ? `installer: ${card.installerShape}` : undefined,
    card.installability ? `installability: ${card.installability.status}` : undefined,
    card.deploymentRole ? `role: ${card.deploymentRole}` : undefined,
    card.firstPartyTemplate?.available ? `template: ${card.firstPartyTemplate.templateId ?? "available"}` : undefined,
    card.capabilityBuilderDefaults?.locality ? `locality: ${card.capabilityBuilderDefaults.locality}` : undefined,
    card.secrets.length ? `env: ${card.secrets.map((secret) => secret.envName).join(", ")}` : undefined,
    card.networkHosts.length ? `hosts: ${card.networkHosts.join(", ")}` : undefined,
  ].filter((item): item is string => Boolean(item)).join("; ");
  return [
    `- ${card.displayName} (${card.id}, ${card.recommendationTier}): ${card.recommendationSummary}`,
    `  ${details}`,
    `  validation: ${card.ambientContract.validationTarget}`,
  ];
}

export function recommendVoiceProviders(hostFacts: VoiceOnboardingHostFacts | undefined): VoiceProviderRecommendation[] {
  const runtimeAvailable = (name: string) =>
    hostFacts?.runtimes.some((runtime) => runtime.name === name && runtime.available) ?? false;
  const isAppleSilicon = hostFacts?.os.platform === "darwin" && hostFacts.os.arch === "arm64";
  const memoryBytes = hostFacts?.hardware.memoryBytes ?? 0;
  const hasPython = runtimeAvailable("Python 3") || runtimeAvailable("Python");
  const hasUv = runtimeAvailable("uv");
  const hasBrew = runtimeAvailable("Homebrew");
  const localRuntimeReady = hasPython || hasUv || hasBrew;
  const enoughMemoryForAdvancedLocal = memoryBytes >= 24 * 1024 * 1024 * 1024;

  return voiceProviderGuidanceCards.map((card) => {
    if (card.id === "piper") {
      return {
        card,
        level: "recommended-now",
        rationale: localRuntimeReady
          ? "lowest-risk local/offline baseline for this host; use the first-party Piper template when the user wants local voice"
          : "still the preferred local baseline, but first verify Python/uv/Homebrew or a matching binary install path",
      };
    }
    if (card.id === "elevenlabs" || card.id === "cartesia") {
      return {
        card,
        level: "good-option",
        rationale: "best cloud choices when the user accepts API keys, network calls, provider cost, and Ambient-managed secret binding",
      };
    }
    if (card.id === "openai-speech") {
      return {
        card,
        level: "good-option",
        rationale: "viable cloud fallback for users already choosing OpenAI speech APIs; keep credentials separate from Ambient provider credentials unless explicitly approved",
      };
    }
    if (card.id === "kokoro-mlx" || card.id === "mlx-audio" || card.id === "kokoro-onnx") {
      const kokoroOnnxReady = card.id === "kokoro-onnx" && (hasPython || hasUv);
      const mlxReady = isAppleSilicon && enoughMemoryForAdvancedLocal && (hasPython || hasUv);
      return {
        card,
        level: kokoroOnnxReady || mlxReady ? "good-option" : "advanced-only",
        rationale:
          kokoroOnnxReady
            ? "dogfooded local ONNX lane with explicit model assets and a smaller dependency footprint than the MLX/Kokoro path"
            : mlxReady
            ? "Apple Silicon and runtime facts make this a plausible higher-quality local option after README verification"
            : "only present as advanced/local after verifying Apple Silicon or MLX support, memory, Python/uv, model size, and upstream install docs",
      };
    }
    if (card.type === "local") {
      return {
        card,
        level: "advanced-only",
        rationale: "do not recommend as the default; require explicit user choice plus README, hardware, dependency, model-size, and validation planning",
      };
    }
    return {
      card,
      level: "custom-only",
      rationale: "use only when the user names a repo/API/model or rejects known local/cloud options; label the path exploratory",
    };
  });
}

function formatVoiceProviderGuidanceCard(card: VoiceProviderGuidanceCard): string[] {
  const suffix = [
    `best for: ${card.bestFor}`,
    `tradeoffs: ${card.tradeoffs}`,
    `setup: ${card.setupNotes}`,
    card.envNames?.length ? `env: ${card.envNames.join(", ")}` : undefined,
    card.networkHosts?.length ? `hosts: ${card.networkHosts.join(", ")}` : undefined,
    `template: ${card.template}`,
  ]
    .filter((item): item is string => Boolean(item))
    .join("; ");
  return [`- ${card.label} (${card.type}, ${card.tier}): ${card.summary}`, `  ${suffix}`];
}

function formatVoiceProviderRecommendationSummary(hostFacts: VoiceOnboardingHostFacts | undefined): string[] {
  const recommendations = recommendVoiceProviders(hostFacts);
  const keyRecommendations = recommendations.filter((recommendation) =>
    ["piper", "elevenlabs", "cartesia", "kokoro-mlx", "mlx-audio", "kokoro-onnx", "custom"].includes(recommendation.card.id),
  );
  return [
    "- First-turn behavior: briefly explain these recommendations, then ask the user to choose local baseline, cloud provider, or custom/advanced provider before planning.",
    ...keyRecommendations.map(
      (recommendation) =>
        `- ${recommendation.card.label}: ${formatVoiceProviderRecommendationLevel(recommendation.level)}; ${recommendation.rationale}.`,
    ),
  ];
}

function formatVoiceProviderRecommendationLevel(level: VoiceProviderRecommendationLevel): string {
  switch (level) {
    case "recommended-now":
      return "recommended now";
    case "good-option":
      return "good option";
    case "advanced-only":
      return "advanced only";
    case "custom-only":
      return "custom only";
  }
}

function formatVoiceOnboardingHostFacts(facts: VoiceOnboardingHostFacts | undefined): string[] {
  if (!facts) {
    return [
      "- OS/arch: unknown; call the host facts bridge or inspect deterministically before making hardware-specific recommendations.",
      "- App mode: unknown.",
      "- CPU/RAM: unknown.",
      "- Accelerator: unknown.",
      "- Runtimes/package managers: unknown.",
    ];
  }
  const memory = facts.hardware.memoryBytes ? formatBytesForPrompt(facts.hardware.memoryBytes) : "unknown";
  const cpu = [facts.hardware.cpuModel, facts.hardware.cpuCount ? `${facts.hardware.cpuCount} logical cores` : undefined]
    .filter(Boolean)
    .join("; ") || "unknown";
  return [
    `- OS/arch: ${facts.os.platform}${facts.os.release ? ` ${facts.os.release}` : ""} / ${facts.os.arch}.`,
    `- App mode: ${facts.os.appMode}.`,
    `- CPU/RAM: ${cpu}; ${memory} RAM.`,
    `- Accelerator: ${facts.hardware.accelerator ?? "unknown"}.`,
    "- Runtimes/package managers:",
    ...facts.runtimes.map(
      (runtime) =>
        `  - ${runtime.name} (${runtime.command}): ${runtime.available ? `available${runtime.version ? `, ${runtime.version}` : ""}` : `missing${runtime.detail ? `, ${runtime.detail}` : ""}`}`,
    ),
  ];
}

function formatBytesForPrompt(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return "unknown";
  const gib = value / 1024 / 1024 / 1024;
  return `${gib >= 10 ? Math.round(gib) : Math.round(gib * 10) / 10} GiB`;
}

export function filterAmbientPluginsBySource(
  plugins: AmbientPluginSummary[],
  sourceFilter: AmbientPluginSourceFilter,
): AmbientPluginSummary[] {
  if (sourceFilter === "all") return plugins;
  return plugins.filter((plugin) => plugin.sourceKind === sourceFilter);
}

export function filterAmbientCapabilities(
  capabilities: AmbientPluginCapabilitySummary[],
  filters: { source: AmbientPluginSourceFilter; runtime: AmbientPluginRuntimeFilter },
): AmbientPluginCapabilitySummary[] {
  return capabilities.filter((capability) => {
    const sourceMatches = filters.source === "all" || capability.sourceKind === filters.source;
    const runtimeMatches = filters.runtime === "all" || capability.runtimeSupport.includes(filters.runtime);
    return sourceMatches && runtimeMatches;
  });
}

export function capabilityDiagnosticsActionState(
  capability: Pick<AmbientPluginCapabilitySummary, "id" | "availability" | "availabilityReason">,
  busyCapabilityId?: string,
): PluginActionState {
  const busy = busyCapabilityId === capability.id;
  const anotherBusy = Boolean(busyCapabilityId && busyCapabilityId !== capability.id);
  return {
    label: busy ? "Inspecting" : "Details",
    disabled: anotherBusy,
    title: capability.availabilityReason
      ? `Show registry diagnostics. Current status: ${formatAmbientAvailability(capability.availability)}. ${capability.availabilityReason}`
      : "Show registry diagnostics for this capability.",
    visible: true,
  };
}

export function generatedCapabilitySourceActionState(
  generated: AmbientGeneratedCapabilitySummary | undefined,
  busyPath?: string,
): PluginActionState {
  const sourcePath = generated?.sourcePath?.trim();
  const busy = Boolean(sourcePath && busyPath === sourcePath);
  return {
    label: busy ? "Opening" : "Open source",
    disabled: !sourcePath || busy,
    title: sourcePath
      ? `Reveal generated capability source: ${sourcePath}`
      : "Generated capability source path is unavailable.",
    visible: Boolean(generated),
  };
}

export function generatedCapabilityValidationActionState(
  generated: AmbientGeneratedCapabilitySummary | undefined,
  options: { busyPath?: string; running?: boolean } = {},
): PluginActionState {
  const sourcePath = generated?.sourcePath?.trim();
  const busy = Boolean(sourcePath && options.busyPath === sourcePath);
  return {
    label: busy ? "Starting" : "Validate",
    disabled: !sourcePath || busy || Boolean(options.running),
    title: sourcePath
      ? options.running
        ? "Wait for the current chat run to finish before starting capability validation."
        : `Start an approval-gated Capability Builder validation for: ${sourcePath}`
      : "Generated capability source path is unavailable.",
    visible: Boolean(generated),
  };
}

export function generatedCapabilityUpdatePlanActionState(
  generated: AmbientGeneratedCapabilitySummary | undefined,
  options: { busyPath?: string; running?: boolean } = {},
): PluginActionState {
  const sourcePath = generated?.sourcePath?.trim();
  const busy = Boolean(sourcePath && options.busyPath === sourcePath);
  return {
    label: busy ? "Planning" : "Plan update",
    disabled: !sourcePath || busy || Boolean(options.running),
    title: sourcePath
      ? options.running
        ? "Wait for the current chat run to finish before planning a capability update."
        : `Start a Capability Builder update/rebuild plan for: ${sourcePath}`
      : "Generated capability source path is unavailable.",
    visible: Boolean(generated),
  };
}

export function generatedCapabilityRemovalPlanActionState(
  generated: AmbientGeneratedCapabilitySummary | undefined,
  options: { busyPath?: string; running?: boolean } = {},
): PluginActionState {
  const sourcePath = generated?.sourcePath?.trim();
  const busy = Boolean(sourcePath && options.busyPath === sourcePath);
  return {
    label: busy ? "Planning" : "Plan removal",
    disabled: !sourcePath || busy || Boolean(options.running),
    title: sourcePath
      ? options.running
        ? "Wait for the current chat run to finish before planning capability removal."
        : `Start a safe uninstall/deactivation plan for: ${sourcePath}`
      : "Generated capability source path is unavailable.",
    visible: Boolean(generated),
  };
}

export function generatedCapabilitySummaryFromHistoryEntry(entry: CapabilityBuilderHistoryEntry): AmbientGeneratedCapabilitySummary {
  return {
    schemaVersion: "ambient-capability-builder-v1",
    status: entry.status,
    ...(entry.goal ? { goal: entry.goal } : {}),
    ...(entry.installerShape ? { installerShape: entry.installerShape } : {}),
    ...(entry.kind ? { kind: entry.kind } : {}),
    ...(entry.provider ? { provider: entry.provider } : {}),
    outputArtifactTypes: entry.artifactOutputTypes,
    sourcePath: entry.relativeRootPath,
    ...(entry.lastValidatedAt ? { lastValidatedAt: entry.lastValidatedAt } : {}),
    ...(entry.registeredAt ? { registeredAt: entry.registeredAt } : {}),
    ...(entry.installedPackageId ? { installedPackageId: entry.installedPackageId } : {}),
    ...(entry.installedSource ? { installedSource: entry.installedSource } : {}),
    ...(entry.version ? { installedVersion: entry.version } : {}),
    refs: {
      ...(typeof entry.refs.latest === "string" ? { latest: entry.refs.latest } : {}),
      ...(typeof entry.refs.installed === "string" ? { installed: entry.refs.installed } : {}),
      ...(typeof entry.refs.lastValidated === "string" ? { lastValidated: entry.refs.lastValidated } : {}),
      ...(typeof entry.refs.lastValidatedHash === "string" ? { lastValidatedHash: entry.refs.lastValidatedHash } : {}),
      ...(typeof entry.refs.lastRepair === "string" ? { lastRepair: entry.refs.lastRepair } : {}),
    },
  };
}

export function capabilityBuilderHistorySourceActionState(
  entry: CapabilityBuilderHistoryEntry,
  busyPath?: string,
): PluginActionState {
  const sourcePath = entry.relativeRootPath.trim();
  const busy = Boolean(sourcePath && busyPath === sourcePath);
  return {
    label: busy ? "Opening" : "Open source",
    disabled: !sourcePath || busy,
    title: sourcePath ? `Reveal preserved generated capability source: ${sourcePath}` : "Generated capability source path is unavailable.",
    visible: true,
  };
}

export function capabilityBuilderHistoryPreviewActionState(
  entry: CapabilityBuilderHistoryEntry,
  options: { busyPath?: string; running?: boolean } = {},
): PluginActionState {
  const sourcePath = entry.relativeRootPath.trim();
  const busy = Boolean(sourcePath && options.busyPath === sourcePath);
  return {
    label: busy ? "Starting" : "Preview",
    disabled: !sourcePath || busy || Boolean(options.running),
    title: sourcePath
      ? options.running
        ? "Wait for the current chat run to finish before previewing this generated source."
        : `Start a chat-first preview for preserved generated source: ${sourcePath}`
      : "Generated capability source path is unavailable.",
    visible: true,
  };
}

export function capabilityBuilderHistoryReregisterActionState(
  entry: CapabilityBuilderHistoryEntry,
  options: { busyPath?: string; running?: boolean } = {},
): PluginActionState {
  const sourcePath = entry.relativeRootPath.trim();
  const busy = Boolean(sourcePath && options.busyPath === sourcePath);
  return {
    label: busy ? "Starting" : "Re-register",
    disabled: !sourcePath || busy || Boolean(options.running) || entry.installedPresent || !entry.valid,
    title: sourcePath
      ? entry.installedPresent
        ? "This generated capability is already installed; use validation or update planning instead."
        : !entry.valid
          ? "Repair or preview this generated source before re-registration; the current static preview has errors."
          : options.running
            ? "Wait for the current chat run to finish before starting re-registration."
            : `Start an approval-gated re-registration flow for: ${sourcePath}`
      : "Generated capability source path is unavailable.",
    visible: true,
  };
}

export function capabilityBuilderHistoryRepairPlanActionState(
  entry: CapabilityBuilderHistoryEntry,
  options: { busyPath?: string; running?: boolean } = {},
): PluginActionState {
  const sourcePath = entry.relativeRootPath.trim();
  const needsRepair = !entry.valid || entry.errors.length > 0 || entry.warnings.length > 0;
  const busy = Boolean(sourcePath && options.busyPath === sourcePath);
  return {
    label: busy ? "Planning" : "Plan repair",
    disabled: !sourcePath || busy || Boolean(options.running),
    title: sourcePath
      ? options.running
        ? "Wait for the current chat run to finish before planning generated source repair."
        : `Start a chat-first repair plan for generated source: ${sourcePath}`
      : "Generated capability source path is unavailable.",
    visible: needsRepair,
  };
}

export function buildCapabilityBuilderHistoryPreviewPrompt(entry: CapabilityBuilderHistoryEntry): string {
  const lines = [
    "Preview this preserved generated Ambient capability source.",
    `Package: ${entry.packageName}`,
    `Builder source path: ${entry.relativeRootPath}`,
    `Current history status: ${entry.status}`,
    entry.goal ? `Original goal: ${entry.goal}` : undefined,
    entry.provider ? `Provider/runtime: ${entry.provider}` : undefined,
    entry.refs.lastRepair ? `Last repair ref: ${entry.refs.lastRepair}` : undefined,
    entry.commandNames.length ? `Declared commands: ${entry.commandNames.join(", ")}` : undefined,
    entry.artifactOutputTypes.length ? `Output artifact types: ${entry.artifactOutputTypes.join(", ")}` : undefined,
    entry.unregisteredAt ? `Unregistered at: ${entry.unregisteredAt}` : undefined,
    "Use the Capability Builder management flow.",
    "First call ambient_capability_builder_history for this package, then call ambient_capability_builder_preview for the builder source path.",
    "Summarize validity, errors, warnings, risks, declared commands, env, artifacts, and health checks.",
    "Do not install dependencies, validate, register, unregister, edit files, or change package state.",
  ].filter((line): line is string => Boolean(line));
  return lines.join("\n");
}

export function buildCapabilityBuilderHistoryRepairPlanPrompt(entry: CapabilityBuilderHistoryEntry): string {
  const lines = [
    "Plan a repair for this preserved generated Ambient capability source.",
    `Package: ${entry.packageName}`,
    `Builder source path: ${entry.relativeRootPath}`,
    `Current history status: ${entry.status}`,
    `Current static preview validity: ${entry.valid ? "valid" : "invalid"}`,
    entry.goal ? `Original goal: ${entry.goal}` : undefined,
    entry.provider ? `Provider/runtime: ${entry.provider}` : undefined,
    entry.refs.lastRepair ? `Last repair ref: ${entry.refs.lastRepair}` : undefined,
    entry.commandNames.length ? `Declared commands: ${entry.commandNames.join(", ")}` : undefined,
    entry.artifactOutputTypes.length ? `Output artifact types: ${entry.artifactOutputTypes.join(", ")}` : undefined,
    entry.errors.length ? `Current preview errors: ${entry.errors.join("; ")}` : undefined,
    entry.warnings.length ? `Current preview warnings: ${entry.warnings.join("; ")}` : undefined,
    "Use the Capability Builder management flow.",
    "Call ambient_capability_builder_repair_plan for the builder source path. Do not call ambient_capability_builder_history or ambient_capability_builder_preview separately during this repair-planning turn.",
    "Present the returned repair plan before changing anything. The plan should include intended descriptor, SKILL.md, wrapper script, test, dependency, env, artifact, validation, and rollback steps as applicable.",
    ...ttsProviderConversionGuidanceForHistoryEntry(entry),
    ...advancedLocalVoiceRepairGuidance(entry),
    "Do not edit files, install dependencies, validate, register, unregister, delete files, or use generic Ambient CLI install/uninstall tools until I approve a specific next step.",
    "Do not call ambient_capability_builder_register until a later approved validation succeeds for the repaired source.",
  ].filter((line): line is string => Boolean(line));
  return lines.join("\n");
}

function advancedLocalVoiceRepairGuidance(entry: CapabilityBuilderHistoryEntry): string[] {
  const text = [entry.packageName, entry.goal, entry.provider, entry.commandNames.join(" "), entry.warnings.join(" "), entry.errors.join(" ")]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  if (!/(mlx|kokoro)/.test(text)) return [];
  return [
    "Advanced local TTS repair guidance:",
    "- Treat mlx-audio/Kokoro as a pinned-environment repair, not an open-ended package-manager retry loop.",
    "- Plan one pinned Python/runtime strategy before mutation: exact Python version, package pins or lockfile, mlx-audio source/version, model id, optional text-processing deps, and known ABI risks.",
    "- Account for fresh dogfood findings: Kokoro through mlx-audio may require misaki plus transitive text-processing deps such as num2words and spaCy, and naive latest-package installs can hit NumPy/Thinc ABI mismatches.",
    "- The repair plan should include a tiny synthesis smoke test that writes a WAV artifact, a bounded health check that does not download large models repeatedly, and a rollback path to the previous package Git ref.",
    "- If the pinned plan is not viable on the detected host, stop and recommend Piper or a cloud provider instead of continuing dependency retries.",
  ];
}

export function buildCapabilityBuilderHistoryReregisterPrompt(entry: CapabilityBuilderHistoryEntry): string {
  const lines = [
    "Re-register this preserved generated Ambient capability package after approval.",
    `Package: ${entry.packageName}`,
    `Builder source path: ${entry.relativeRootPath}`,
    `Current history status: ${entry.status}`,
    entry.goal ? `Original goal: ${entry.goal}` : undefined,
    entry.provider ? `Provider/runtime: ${entry.provider}` : undefined,
    entry.refs.lastRepair ? `Last repair ref: ${entry.refs.lastRepair}` : undefined,
    entry.refs.lastValidated ? `Last validated ref: ${entry.refs.lastValidated}` : undefined,
    entry.unregisteredAt ? `Unregistered at: ${entry.unregisteredAt}` : undefined,
    "Use the Capability Builder management flow.",
    "First call ambient_capability_builder_history for this package, then call ambient_capability_builder_preview for the builder source path.",
    "If the source is invalid or already installed, stop and report the issue.",
    "If the preview is valid, ask me to approve re-registration; after approval, call ambient_capability_builder_register for the same builder source path.",
    "Do not install dependencies, edit files, delete files, or use generic Ambient CLI install/uninstall tools.",
  ].filter((line): line is string => Boolean(line));
  return lines.join("\n");
}

export function buildGeneratedCapabilityValidationPrompt(input: {
  packageName: string;
  generated: AmbientGeneratedCapabilitySummary;
}): string {
  const sourcePath = input.generated.sourcePath?.trim();
  const lines = [
    "Validate this generated Ambient capability package.",
    `Package: ${input.packageName}`,
    sourcePath ? `Builder source path: ${sourcePath}` : undefined,
    input.generated.goal ? `Original goal: ${input.generated.goal}` : undefined,
    input.generated.kind ? `Capability kind: ${input.generated.kind}` : undefined,
    input.generated.provider ? `Provider/runtime: ${input.generated.provider}` : undefined,
    input.generated.outputArtifactTypes.length ? `Output artifact types: ${input.generated.outputArtifactTypes.join(", ")}` : undefined,
    input.generated.refs.lastRepair ? `Last repair ref: ${input.generated.refs.lastRepair}` : undefined,
    input.generated.refs.installed ? `Installed ref: ${input.generated.refs.installed}` : undefined,
    "Use the Capability Builder management flow.",
    ...ttsProviderConversionGuidanceForGeneratedCapability(input.generated),
    "First call ambient_capability_builder_preview for the builder source path and summarize errors, warnings, risks, declared commands, env, artifacts, and health checks.",
    "If the preview is valid, ask me to approve validation; after approval, call ambient_capability_builder_validate for the same source path.",
    "Do not install dependencies, register, rebuild, uninstall, or change files unless I explicitly approve that as a separate step.",
    "After validation, report the validation status, log path, artifact paths, and current git ref.",
  ].filter((line): line is string => Boolean(line));
  return lines.join("\n");
}

export function buildGeneratedCapabilityUpdatePlanPrompt(input: {
  packageName: string;
  generated: AmbientGeneratedCapabilitySummary;
}): string {
  const sourcePath = input.generated.sourcePath?.trim();
  const lines = [
    "Plan an update or rebuild for this generated Ambient capability package.",
    `Package: ${input.packageName}`,
    sourcePath ? `Builder source path: ${sourcePath}` : undefined,
    input.generated.goal ? `Original goal: ${input.generated.goal}` : undefined,
    input.generated.kind ? `Capability kind: ${input.generated.kind}` : undefined,
    input.generated.provider ? `Provider/runtime: ${input.generated.provider}` : undefined,
    input.generated.outputArtifactTypes.length ? `Output artifact types: ${input.generated.outputArtifactTypes.join(", ")}` : undefined,
    input.generated.refs.latest ? `Latest source ref: ${input.generated.refs.latest}` : undefined,
    input.generated.refs.lastRepair ? `Last repair ref: ${input.generated.refs.lastRepair}` : undefined,
    input.generated.refs.installed ? `Installed ref: ${input.generated.refs.installed}` : undefined,
    input.generated.refs.lastValidated ? `Last validated ref: ${input.generated.refs.lastValidated}` : undefined,
    "Use the Capability Builder management flow.",
    ...ttsProviderConversionGuidanceForGeneratedCapability(input.generated),
    "Use Capability Builder tools only for package inspection. Do not use shell, browser, ambient_cli, direct filesystem, or package install tools during this planning step.",
    "First inspect the builder source path and current installed/generated provenance, then call ambient_capability_builder_update_plan for the builder source path.",
    "Do not call ambient_capability_builder_preview separately during update planning; ambient_capability_builder_update_plan already includes preview facts.",
    "Propose a concise update/rebuild plan before making any changes. Include intended file changes, dependency commands, env or permission changes, artifact behavior changes, validation plan, registration impact, version/ref handling, rollback point, and user approval checkpoints.",
    "Do not install dependencies, edit files, run validation, register, rebuild, uninstall, or change package state until I approve a specific next step.",
    "If no update is needed, say so and recommend validation instead of making changes.",
  ].filter((line): line is string => Boolean(line));
  return lines.join("\n");
}

export function buildGeneratedCapabilityRemovalPlanPrompt(input: {
  packageName: string;
  generated: AmbientGeneratedCapabilitySummary;
}): string {
  const sourcePath = input.generated.sourcePath?.trim();
  const lines = [
    "Plan safe removal or deactivation for this generated Ambient capability package.",
    `Package: ${input.packageName}`,
    sourcePath ? `Builder source path: ${sourcePath}` : undefined,
    input.generated.installedPackageId ? `Installed package id: ${input.generated.installedPackageId}` : undefined,
    input.generated.installedSource ? `Installed source: ${input.generated.installedSource}` : undefined,
    input.generated.goal ? `Original goal: ${input.generated.goal}` : undefined,
    input.generated.outputArtifactTypes.length ? `Output artifact types: ${input.generated.outputArtifactTypes.join(", ")}` : undefined,
    input.generated.refs.lastRepair ? `Last repair ref: ${input.generated.refs.lastRepair}` : undefined,
    input.generated.refs.installed ? `Installed ref: ${input.generated.refs.installed}` : undefined,
    "Use the Capability Builder management flow.",
    "Use Capability Builder tools only for package inspection. Do not use shell, browser, ambient_cli, direct filesystem, or package install tools during this planning step.",
    "First inspect the installed/generated provenance and builder source path, then call ambient_capability_builder_removal_plan.",
    "Do not call ambient_capability_builder_preview separately during removal planning; ambient_capability_builder_removal_plan already includes preview facts when builder source exists.",
    "Propose a concise removal plan before changing anything. Distinguish installed Ambient CLI package state, managed builder source, package Git history, validation logs, generated artifacts, env/secret metadata, and registry visibility.",
    "Recommend the least destructive default: unregister or disable the installed capability while preserving builder source, Git history, validation logs, and artifacts unless I explicitly approve deletion.",
    "If I approve least-destructive unregister/deactivation, call ambient_capability_builder_unregister; do not use generic Ambient CLI uninstall for generated capabilities.",
    "Do not delete files, unregister, disable, edit package state, remove secrets, or change registry/install metadata until I approve a specific next step.",
    "Include rollback steps for restoring the installed capability or re-registering from the preserved builder source.",
  ].filter((line): line is string => Boolean(line));
  return lines.join("\n");
}

function ttsProviderConversionGuidanceForGeneratedCapability(generated: AmbientGeneratedCapabilitySummary): string[] {
  if (!isTtsLikeNonProviderCapability({
    installerShape: generated.installerShape,
    kind: generated.kind,
    goal: generated.goal,
    provider: generated.provider,
    commandNames: [],
    outputArtifactTypes: generated.outputArtifactTypes,
    warnings: [],
    errors: [],
  })) {
    return [];
  }
  return ttsProviderConversionGuidanceLines();
}

function ttsProviderConversionGuidanceForHistoryEntry(entry: CapabilityBuilderHistoryEntry): string[] {
  if (!isTtsLikeNonProviderCapability({
    installerShape: entry.installerShape,
    kind: entry.kind,
    goal: entry.goal,
    provider: entry.provider,
    commandNames: entry.commandNames,
    outputArtifactTypes: entry.artifactOutputTypes,
    warnings: entry.warnings,
    errors: entry.errors,
  })) {
    return [];
  }
  return ttsProviderConversionGuidanceLines();
}

function ttsProviderConversionGuidanceLines(): string[] {
  return [
    "TTS provider conversion guidance:",
    "- This generated package appears to produce TTS/audio artifacts but is not currently an Ambient chat voice provider.",
    "- If the user wants assistant voice output, read-aloud chat, or provider selection in Settings, do not validate, register, or re-register it as a one-off artifact generator.",
    "- Plan repair with requestedRepair exactly: Convert this TTS artifact generator into an Ambient tts-provider for chat voicing.",
    "- The repair should add installerShape tts-provider provenance, descriptor voiceProvider metadata, the normalized --text/--output/--format/--voice command contract, concise JSON stdout, and provider-contract validation before registration.",
  ];
}

function isTtsLikeNonProviderCapability(input: {
  installerShape?: string;
  kind?: string;
  goal?: string;
  provider?: string;
  commandNames: string[];
  outputArtifactTypes: string[];
  warnings: string[];
  errors: string[];
}): boolean {
  if (input.installerShape === "tts-provider") return false;
  const text = [
    input.kind,
    input.goal,
    input.provider,
    ...input.commandNames,
    ...input.outputArtifactTypes,
    ...input.warnings,
    ...input.errors,
  ].filter(Boolean).join(" ");
  return /\b(tts|text[- ]?to[- ]?speech|speech|voice|read aloud|chat voic|spoken|synthesi[sz]e)\b/i.test(text)
    || input.outputArtifactTypes.some((type) => /^(wav|mp3|ogg)$/i.test(type.trim()));
}

export function pluginAuthCompleteActionState(hasPendingAuth: boolean, code: string, completing: boolean): PluginActionState {
  return {
    label: completing ? "Completing" : "Complete auth",
    disabled: completing || !code.trim(),
    title: hasPendingAuth
      ? code.trim()
        ? "Complete the pending plugin app authorization with this code."
        : "Paste the authorization code from the provider to finish plugin app auth."
      : "Start plugin app auth before completing it.",
    visible: hasPendingAuth,
  };
}

export function pluginDetailsActionState(
  plugin: Pick<AmbientPluginSummary, "id" | "installState" | "enabled" | "trusted">,
  selectedPluginId?: string,
): PluginActionState {
  const selected = selectedPluginId === plugin.id;
  return {
    label: selected ? "Hide details" : "Details",
    disabled: false,
    title: [
      `Install state: ${formatPluginToken(plugin.installState)}.`,
      plugin.enabled ? "Enabled." : "Disabled.",
      plugin.trusted ? "Trusted." : "Trust may be required before executable capabilities run.",
    ].join(" "),
    visible: true,
  };
}

export function mcpServerSearchResultSubtitle(result: AmbientMcpServerSearchResult): string {
  return [
    result.transport ? formatPluginToken(result.transport) : undefined,
    result.tier ? formatPluginToken(result.tier) : undefined,
    result.status ? formatPluginToken(result.status) : undefined,
    result.tools.length ? `${result.tools.length} tool${result.tools.length === 1 ? "" : "s"}` : undefined,
    result.installed ? `installed as ${result.workloadName ?? "Ambient workload"}` : "not installed",
  ].filter((part): part is string => Boolean(part)).join(" - ");
}

export function mcpInstalledServerStatusLabel(server: AmbientMcpInstalledServerSummary): string {
  if (server.runtimeListError) return "Runtime status unavailable";
  return server.workloadStatus ? formatPluginToken(server.workloadStatus) : "Status unknown";
}

export function mcpContainerRuntimeStatusLabel(status?: AmbientMcpContainerRuntimeStatusKind): string {
  if (!status) return "Checking";
  if (status === "ready") return "Ready";
  if (status === "installed-not-running") return "Installed, not running";
  if (status === "missing") return "Runtime missing";
  if (status === "unsupported") return "ToolHive unavailable";
  if (status === "blocked-by-permissions") return "Permission repair needed";
  return "Needs review";
}

export function mcpContainerRuntimeTone(status?: AmbientMcpContainerRuntimeStatusKind): "success" | "warning" | "error" | "info" {
  if (!status) return "info";
  if (status === "ready") return "success";
  if (status === "installed-not-running" || status === "missing" || status === "blocked-by-permissions") return "warning";
  return "error";
}

export function mcpContainerRuntimePrimaryActionLabel(status?: AmbientMcpContainerRuntimeStatusKind): string {
  if (!status) return "Refresh status";
  if (status === "ready") return "Refresh status";
  if (status === "installed-not-running") return "Retry after starting runtime";
  if (status === "blocked-by-permissions") return "Open permission repair steps";
  if (status === "missing") return "Refresh after installing runtime";
  if (status === "unsupported") return "Retry ToolHive check";
  return "Refresh status";
}

export function mcpContainerRuntimeDetailRows(status: AmbientMcpContainerRuntimeStatus): string[] {
  return [
    `Runtime: ${status.runtime ? formatPluginToken(status.runtime) : "Not detected"}`,
    `ToolHive: ${mcpContainerRuntimeStatusLabel(status.toolHive.status === "ready" ? "ready" : "unsupported")}`,
    `Next: ${formatPluginToken(status.nextAction)}`,
    ...(status.installPlan ? [`Setup: ${status.installPlan.primaryAction.label}`] : []),
    ...(status.setup.promptSuppressed ? [`Prompt: ${formatPluginToken(status.setup.reason)}`] : []),
    ...(status.setup.userDecision === "install-launched" && status.setup.installActionId ? [`Last setup action: ${status.setup.installActionId}`] : []),
    ...(status.setup.userDecision === "install-launched" && status.setup.installRuntime ? [`Last setup runtime: ${formatPluginToken(status.setup.installRuntime)}`] : []),
    `Checked: ${new Date(status.checkedAt).toLocaleString()}`,
    ...status.postInstallQueue.map((item) => `${formatPluginToken(item.capabilityId)}: ${formatPluginToken(item.status)}`),
    ...status.defaultCapabilities.map((item) => `${formatPluginToken(item.capabilityId)} Reconcile: ${formatPluginToken(item.status)}`),
  ];
}

export function mcpContainerRuntimeSetupResumeRows(status: AmbientMcpContainerRuntimeStatus | undefined): string[] {
  const setup = status?.setup;
  if (!setup || setup.userDecision !== "install-launched") return [];
  return [
    setup.installActionId ? `Last setup action: ${setup.installActionId}` : undefined,
    setup.installRuntime ? `Runtime: ${formatPluginToken(setup.installRuntime)}` : undefined,
    setup.installUrl ? `Opened URL: ${setup.installUrl}` : undefined,
    setup.lastDecisionAt ? `Opened at: ${setup.lastDecisionAt}` : undefined,
  ].filter((row): row is string => Boolean(row));
}

export function mcpServerInstallActionState(
  preview: AmbientMcpInstallPreview | undefined,
  busyKey?: string,
): PluginActionState {
  if (!preview) {
    return {
      label: "Install",
      disabled: true,
      visible: false,
      title: "Review an MCP server before installing it.",
    };
  }
  const running = busyKey === `install:${preview.serverId}`;
  if (running) {
    return {
      label: "Installing",
      disabled: true,
      visible: true,
      title: "Installing this MCP server through ToolHive.",
    };
  }
  if (preview.blockers.length > 0 || !preview.runPlan) {
    return {
      label: "Blocked",
      disabled: true,
      visible: true,
      title: preview.blockers[0] ?? "Install blockers must be resolved before this server can run.",
    };
  }
  return {
    label: "Install",
    disabled: false,
    visible: true,
    title: `Install ${preview.title} as ${preview.runPlan.workloadName}.`,
  };
}

export function mcpDefaultCapabilityInstallActionState(
  capability: AmbientMcpDefaultCapabilitySummary | undefined,
  input: { runtimeReady?: boolean; busyKey?: string } = {},
): PluginActionState {
  if (!capability || capability.status === "installed") {
    return {
      label: "Set up",
      disabled: true,
      visible: false,
      title: capability ? `${capability.title} is already installed.` : "No default capability selected.",
    };
  }
  const busy = input.busyKey === `default-capability:${capability.capabilityId}`;
  if (busy || capability.status === "installing" || capability.status === "warming_up") {
    const checking = capability.status === "warming_up" || mcpDefaultCapabilityHasExistingInstallEvidence(capability);
    return {
      label: checking ? "Checking" : "Setting up",
      disabled: true,
      visible: true,
      title: checking
        ? `${capability.title} is being checked with existing Ambient default capability state.`
        : `Installing ${capability.title} through the Ambient default ToolHive runtime path.`,
    };
  }
  if (capability.nextAction === "approve-default-capability" || capability.nextAction === "install-default-capability") {
    const hasExistingInstallEvidence = mcpDefaultCapabilityHasExistingInstallEvidence(capability);
    return {
      label: capability.status === "failed"
        ? `Repair ${capability.title}`
        : hasExistingInstallEvidence
          ? `Retry ${capability.title}`
          : `Set up ${capability.title}`,
      disabled: input.runtimeReady !== true,
      visible: true,
      title: input.runtimeReady === true
        ? hasExistingInstallEvidence
          ? `Retry ${capability.title} as the Ambient default capability ${capability.workloadName} using the existing install state.`
          : `Install ${capability.title} as the Ambient default capability ${capability.workloadName}.`
        : `${capability.title} is waiting for the isolated MCP runtime to become ready.`,
    };
  }
  if (capability.nextAction === "install-runtime") {
    return {
      label: "Runtime needed",
      disabled: true,
      visible: true,
      title: capability.message,
    };
  }
  if (capability.nextAction === "review-descriptor") {
    return {
      label: "Review needed",
      disabled: true,
      visible: true,
      title: capability.message,
    };
  }
  return {
    label: capability.status === "failed" || capability.nextAction === "inspect-failure" ? `Repair ${capability.title}` : "Inspect",
    disabled: true,
    visible: true,
    title: capability.message,
  };
}

function mcpDefaultCapabilityHasExistingInstallEvidence(capability: AmbientMcpDefaultCapabilitySummary): boolean {
  return Boolean(
    capability.installedEndpoint ||
      capability.installedWorkloadStatus ||
      capability.status === "installing" ||
      capability.status === "warming_up" ||
      capability.status === "failed" ||
      capability.nextAction === "inspect-failure",
  );
}

export function mcpContainerRuntimeDiagnosticsActionState(
  status: AmbientMcpContainerRuntimeStatus | undefined,
  input: { error?: string; busy?: boolean } = {},
): PluginActionState {
  const error = input.error?.trim();
  const defaultCapabilityNeedsAttention = Boolean(
    status?.defaultCapabilities.some(
      (capability) =>
        capability.status === "failed" ||
        capability.status === "blocked_descriptor" ||
        capability.status === "needs_review" ||
        capability.nextAction === "inspect-failure" ||
        capability.nextAction === "review-descriptor",
    ),
  );
  const visible = Boolean(error || (status && status.status !== "ready") || defaultCapabilityNeedsAttention);
  const busy = Boolean(input.busy);
  return {
    label: busy ? "Exporting" : "Export diagnostics",
    disabled: busy || !visible,
    visible,
    title: busy
      ? "Diagnostic export is already running."
      : error
        ? `Export an MCP runtime diagnostic bundle. Current error: ${error}`
        : defaultCapabilityNeedsAttention
          ? "Export an MCP runtime diagnostic bundle with default capability reconciliation state, ToolHive status, and recent app diagnostics."
          : "Export an MCP runtime diagnostic bundle with runtime probe state, host readiness, and recent app diagnostics.",
  };
}

export function mcpContainerRuntimeInstallActionViews(
  status: AmbientMcpContainerRuntimeStatus | undefined,
  input: { launchBusy?: boolean } = {},
): McpContainerRuntimeInstallActionView[] {
  const plan = status?.installPlan;
  if (!plan) return [];
  const actions = [plan.primaryAction, ...plan.alternatives];
  const seen = new Set<string>();
  const uniqueActions = actions.filter((action) => {
    if (seen.has(action.id)) return false;
    seen.add(action.id);
    return true;
  });
  return uniqueActions.map((action, index) => {
    const commandPreview = action.managedInstall?.commands.map((command) => [command.exe, ...command.args].join(" ")).join(" && ");
    return {
      actionId: action.id,
      label: action.label,
      disabled: Boolean(input.launchBusy),
      visible: true,
      primary: index === 0,
      runtime: action.runtime,
      kind: action.kind,
      busyLabel: action.kind === "managed-install" ? "Installing" : "Opening",
      ...(commandPreview ? { commandPreview } : {}),
      ...(action.managedInstall?.execution ? { managedExecution: action.managedInstall.execution } : {}),
      title: action.kind === "managed-install" && action.managedInstall
        ? [
            action.reason,
            `Strategy: ${action.managedInstall.strategy}`,
            `Execution: ${action.managedInstall.execution}`,
            `Commands: ${commandPreview}`,
          ].join("\n")
        : action.reason,
    };
  });
}

export function mcpContainerRuntimeLifecycleActionViews(
  status: AmbientMcpContainerRuntimeStatus | undefined,
  input: { busyKey?: string; disabled?: boolean } = {},
): McpContainerRuntimeLifecycleActionView[] {
  if (!status || status.status === "ready" || status.status === "missing") return [];
  const hasRuntimeTarget = Boolean(
    status.runtime === "docker" ||
    status.runtime === "podman" ||
    status.runtime === "colima" ||
    status.hosts.some((host) => (
      host.kind === "docker" ||
      host.kind === "podman" ||
      host.kind === "colima"
    ) && host.status !== "missing"),
  );
  if (!hasRuntimeTarget) return [];
  const actions: AmbientMcpContainerRuntimeLifecycleAction[] =
    status.status === "installed-not-running"
      ? ["restart", "force-quit-and-restart", "open-recovery"]
      : ["open-recovery"];
  return actions.map((action, index) => {
    const previewBusy = input.busyKey === `preview:${action}`;
    const runBusy = input.busyKey === `run:${action}`;
    const busy = previewBusy || runBusy;
    const danger = action === "force-quit-and-restart";
    return {
      action,
      label: busy ? lifecycleBusyLabel(action, previewBusy) : lifecycleActionLabel(action),
      disabled: Boolean(input.disabled || input.busyKey),
      visible: true,
      primary: index === 0,
      danger,
      busyLabel: lifecycleBusyLabel(action, false),
      title: lifecycleActionTitle(action),
    };
  });
}

export function mcpContainerRuntimeLifecycleRunActionState(
  preview: AmbientMcpContainerRuntimeLifecyclePreview | undefined,
  input: { busyKey?: string } = {},
): PluginActionState & { danger: boolean } {
  const action = preview?.action ?? "restart";
  const busy = Boolean(preview && input.busyKey === `run:${preview.action}`);
  const blocked = !preview || preview.status !== "available";
  const force = preview?.action === "force-quit-and-restart";
  return {
    label: busy
      ? lifecycleBusyLabel(action, false)
      : !preview
        ? "Preview first"
        : force
          ? "Confirm force quit and restart"
          : preview.action === "open-recovery"
            ? "Open recovery"
            : "Run restart",
    disabled: busy || blocked || Boolean(input.busyKey && !busy),
    visible: Boolean(preview),
    danger: force,
    title: !preview
      ? "Preview the runtime lifecycle action before running it."
      : blocked
        ? preview.summary
        : force
          ? mcpContainerRuntimeLifecycleForceWarningText
          : preview.summary,
  };
}

export function mcpContainerRuntimeLifecycleStatusView(
  input: {
    preview?: AmbientMcpContainerRuntimeLifecyclePreview;
    progress?: AmbientMcpContainerRuntimeLifecycleProgress;
    result?: AmbientMcpContainerRuntimeLifecycleResult;
    error?: string;
  },
): McpContainerRuntimeLifecycleStatusView | undefined {
  if (input.error) return { kind: "error", message: input.error };
  if (input.result) {
    return {
      kind: input.result.status === "ready" || input.result.status === "running" ? "success" : "error",
      message: input.result.message,
    };
  }
  if (input.progress) {
    return {
      kind: input.progress.status === "failed" ? "error" : input.progress.status === "succeeded" ? "success" : "info",
      message: input.progress.message,
    };
  }
  if (input.preview) {
    return {
      kind: input.preview.status === "blocked" ? "error" : "info",
      message: input.preview.summary,
    };
  }
  return undefined;
}

export function mcpContainerRuntimeLifecyclePreviewRows(
  preview: AmbientMcpContainerRuntimeLifecyclePreview | undefined,
): string[] {
  if (!preview) return [];
  return [
    `Action: ${formatPluginToken(preview.action)}`,
    `Runtime: ${formatPluginToken(preview.runtime)}`,
    `Platform: ${preview.platform}`,
    `Reason: ${formatPluginToken(preview.reason)}`,
    `Interruption: ${preview.expectedInterruption}`,
    `Targets: ${preview.targets.length}`,
    `Commands: ${preview.commands.length}`,
  ];
}

export function mcpContainerRuntimeLifecycleWarnings(
  preview: AmbientMcpContainerRuntimeLifecyclePreview | undefined,
): string[] {
  if (!preview) return [];
  const warnings = [...preview.warnings];
  if (preview.requiresConfirmation && !warnings.includes(mcpContainerRuntimeLifecycleForceWarningText)) {
    warnings.unshift(mcpContainerRuntimeLifecycleForceWarningText);
  }
  return warnings;
}

export function mcpContainerRuntimeLifecycleCommandPreview(
  command: AmbientMcpContainerRuntimeLifecycleCommand,
): string {
  return [command.exe, ...command.args].join(" ");
}

function lifecycleActionLabel(action: AmbientMcpContainerRuntimeLifecycleAction): string {
  if (action === "force-quit-and-restart") return "Preview force quit";
  if (action === "open-recovery") return "Preview recovery";
  return "Preview restart";
}

function lifecycleBusyLabel(
  action: AmbientMcpContainerRuntimeLifecycleAction,
  previewing: boolean,
): string {
  if (previewing) return "Previewing";
  if (action === "force-quit-and-restart") return "Force restarting";
  if (action === "open-recovery") return "Opening";
  return "Restarting";
}

function lifecycleActionTitle(action: AmbientMcpContainerRuntimeLifecycleAction): string {
  if (action === "force-quit-and-restart") return mcpContainerRuntimeLifecycleForceWarningText;
  if (action === "open-recovery") return "Preview recovery guidance for this runtime and platform.";
  return "Preview the graceful runtime restart plan before running it.";
}

export function mcpDefaultCapabilityRuntimeHandoffCandidate(
  status: AmbientMcpContainerRuntimeStatus | undefined,
): AmbientMcpDefaultCapabilitySummary | undefined {
  if (!status || status.status !== "ready") return undefined;
  return status.defaultCapabilities.find((capability) => {
    const action = mcpDefaultCapabilityInstallActionState(capability, { runtimeReady: true });
    return action.visible &&
      !action.disabled &&
      (capability.nextAction === "approve-default-capability" || capability.nextAction === "install-default-capability");
  });
}

export function mcpContainerRuntimeShouldOpenStartupPanel(
  status: AmbientMcpContainerRuntimeStatus | undefined,
): boolean {
  if (!status) return false;
  if (status.setup.shouldPrompt) return true;
  return Boolean(mcpDefaultCapabilityRuntimeHandoffCandidate(status));
}

export function mcpServerUninstallActionState(
  server: AmbientMcpInstalledServerSummary,
  busyKey?: string,
): PluginActionState {
  const running = busyKey === `uninstall:${server.serverId}:${server.workloadName}`;
  return {
    label: running ? "Removing" : "Uninstall",
    disabled: running,
    visible: true,
    title: running
      ? "Removing this Ambient-managed ToolHive workload."
      : `Stop and remove ${server.workloadName}. Secrets are not deleted.`,
  };
}

export function mcpToolReviewAcceptActionState(
  server: AmbientMcpInstalledServerSummary,
  busyKey?: string,
): PluginActionState {
  const running = busyKey === `tool-review:${server.serverId}:${server.workloadName}`;
  const needsReview = server.toolDescriptorReviewStatus === "needs-review";
  return {
    label: running ? "Trusting" : "Trust tools",
    disabled: running || !needsReview || !server.lastKnownToolDescriptorHash,
    visible: needsReview,
    title: running
      ? "Trusting the current MCP tool descriptor snapshot."
      : !server.lastKnownToolDescriptorHash
        ? "Refresh MCP tool discovery before accepting this descriptor review."
        : "Trust the current tool descriptor snapshot for this installed MCP server.",
  };
}

export function googleWorkspaceConnectorLabel(connectorId: string): string {
  if (connectorId === "google.gmail") return "Gmail";
  if (connectorId === "google.calendar") return "Calendar";
  if (connectorId === "google.drive") return "Drive";
  return connectorId;
}

export function dedupeGoogleWorkspaceAccounts(connectors: AmbientPluginAppAuthSummary[]): AmbientPluginAuthAccountSummary[] {
  const accountsById = new Map<string, AmbientPluginAuthAccountSummary>();
  for (const connector of connectors) {
    for (const account of connector.accounts) {
      accountsById.set(account.accountId, account);
    }
  }
  return [...accountsById.values()];
}

export function googleWorkspaceAccountRows(
  connectors: AmbientPluginAppAuthSummary[],
  formatTime: (value: string) => string = (value) => value,
): GoogleWorkspaceAccountRow[] {
  const connectorLabelsByAccountId = new Map<string, Set<string>>();
  for (const connector of connectors) {
    for (const account of connector.accounts) {
      const labels = connectorLabelsByAccountId.get(account.accountId) ?? new Set<string>();
      labels.add(googleWorkspaceConnectorLabel(connector.connectorId));
      connectorLabelsByAccountId.set(account.accountId, labels);
    }
  }
  return dedupeGoogleWorkspaceAccounts(connectors).map((account) => ({
    id: account.id,
    accountId: account.accountId,
    label: account.label,
    identityLabel: account.email ?? account.label,
    handleLabel: account.accountId === "default" ? "default" : account.accountId,
    email: account.email,
    status: account.status,
    connectorLabels: [...(connectorLabelsByAccountId.get(account.accountId) ?? new Set<string>())],
    lastValidatedLabel: account.lastValidatedAt ? formatTime(account.lastValidatedAt) : undefined,
    validationError: account.validationError,
  }));
}

export function googleWorkspaceStatusItems(
  integration: FirstPartyGoogleIntegrationState | undefined,
  formatTime: (value: string) => string = (value) => value,
): string[] {
  if (!integration) return ["Not loaded"];
  const items = [
    `Auth ${formatPluginToken(integration.authMode)}`,
    `${integration.sidecar.adapter === "gws" ? "gws" : "Sidecar"} ${formatPluginToken(integration.sidecar.state)}`,
    integration.install ? `Install ${formatPluginToken(integration.install.status)}` : undefined,
    integration.setup ? `Setup ${formatPluginToken(integration.setup.status)}` : undefined,
    integration.setup?.oauthClientConfigured === true ? "OAuth client Configured" : undefined,
    integration.setup?.oauthClientConfigured === false ? "OAuth client Required" : undefined,
    integration.sidecar.pending ? `${integration.sidecar.pending} pending` : undefined,
    integration.setup?.startedAt ? `Started ${formatTime(integration.setup.startedAt)}` : undefined,
    integration.setup?.finishedAt ? `Finished ${formatTime(integration.setup.finishedAt)}` : undefined,
  ].filter((item): item is string => Boolean(item));
  return integration.enabled ? items : [...items, "Unavailable"];
}

export function googleWorkspaceValidationFeedbackForAccount(
  feedback: GoogleWorkspaceValidationFeedback | undefined,
  accountId: string | undefined,
): GoogleWorkspaceValidationFeedback | undefined {
  if (!feedback || !accountId) return undefined;
  return feedback.accountId === accountId ? feedback : undefined;
}

export function googleWorkspaceValidationButtonView(
  baseLabel: string,
  feedback: GoogleWorkspaceValidationFeedback | undefined,
): GoogleWorkspaceValidationButtonView {
  if (feedback?.status === "validating") {
    return {
      label: "Validating",
      icon: "spinner",
      tone: "default",
    };
  }
  if (feedback?.status === "validated") {
    return {
      label: "Validated",
      icon: "success",
      tone: "success",
    };
  }
  if (feedback?.status === "failed") {
    return {
      label: "Retry",
      icon: "error",
      tone: "error",
    };
  }
  return {
    label: baseLabel,
    icon: "none",
    tone: "default",
  };
}

export function googleWorkspaceActionState(
  integration: FirstPartyGoogleIntegrationState | undefined,
  action: GoogleWorkspaceActionKind,
  busy?: string,
): PluginActionState {
  const usesGws = integration?.authMode === "gws";
  const sidecarMissing = usesGws && integration?.sidecar.state === "missing";
  const installRunning = integration?.install?.status === "running";
  const setupRunning = integration?.setup?.status === "running" || integration?.setup?.status === "validating";
  const anyBusy = Boolean(busy || installRunning || setupRunning);
  if (action === "install") {
    const installing = busy === "install" || installRunning;
    return {
      label: installing ? "Installing" : "Install gws",
      disabled: !usesGws || installing || Boolean(busy),
      title: usesGws
        ? "Install Ambient's pinned, checksum-verified Google Workspace CLI binary."
        : "Managed gws install is only used by the Google Workspace CLI adapter.",
      visible: usesGws && (sidecarMissing || integration?.install?.status === "error" || integration?.install?.status === "unsupported" || installRunning),
    };
  }
  if (action === "connect") {
    return {
      label: busy === "login" ? "Starting" : "Connect account",
      disabled: !usesGws || !integration?.enabled || sidecarMissing || anyBusy,
      title: sidecarMissing
        ? "Install gws before connecting a Google account."
        : "Start Google sign-in in the browser for a local gws account.",
      visible: usesGws,
    };
  }
  if (action === "repair") {
    return {
      label: busy === "setup" ? "Starting" : "Repair setup",
      disabled: !usesGws || !integration?.enabled || sidecarMissing || anyBusy,
      title: sidecarMissing
        ? "Install gws before repairing Google setup."
        : "Run gws auth setup for cases that need OAuth client or project repair.",
      visible: usesGws,
    };
  }
  if (action === "validate") {
    return {
      label: busy === "validate" ? "Validating" : "Validate",
      disabled: !usesGws || !integration?.enabled || sidecarMissing || anyBusy,
      title: sidecarMissing
        ? "Install gws before validating a Google account."
        : "Run identity, Gmail, Calendar, and Drive read probes for this account.",
      visible: usesGws,
    };
  }
  return {
    label: busy === "cancel" ? "Canceling" : "Cancel setup",
    disabled: !setupRunning || busy === "cancel",
    title: setupRunning ? "Cancel the in-flight Google Workspace setup or login process." : "No Google Workspace setup is currently running.",
    visible: Boolean(usesGws && setupRunning),
  };
}

export function codexMarketplaceAddActionState(source: string, adding: boolean, allowExperimentalUrl = false): PluginActionState {
  if (adding) {
    return {
      label: "Adding",
      disabled: true,
      title: "Ambient is adding this Codex marketplace source.",
      visible: true,
    };
  }
  const trimmed = source.trim();
  if (trimmed && isExperimentalCodexMarketplaceUrl(trimmed) && !allowExperimentalUrl) {
    return {
      label: "Enable advanced URL",
      disabled: true,
      title: "Arbitrary marketplace URLs are experimental. Enable advanced URL sources before adding a non-GitHub remote marketplace.",
      visible: true,
    };
  }
  return {
    label: "Add source",
    disabled: trimmed.length === 0,
    title: trimmed
      ? "Add a local Codex marketplace path, GitHub URL, GitHub owner/repo shorthand, or opted-in advanced URL."
      : "Enter a Codex marketplace path, GitHub URL, owner/repo shorthand, or opted-in advanced URL.",
    visible: true,
  };
}

function isExperimentalCodexMarketplaceUrl(source: string): boolean {
  return /^https?:\/\//i.test(source) && !isGithubMarketplaceUrl(source);
}

function isGithubMarketplaceUrl(source: string): boolean {
  return /^https?:\/\/github\.com\/[^/]+\/[^/]+/i.test(source) || /^https?:\/\/raw\.githubusercontent\.com\/[^/]+\/[^/]+\/.+/i.test(source);
}

export function codexMarketplaceRemoveActionState(
  source: Pick<CodexMarketplaceSourceSummary, "id" | "removable">,
  removingSourceId?: string,
): PluginActionState {
  if (!source.removable) {
    return {
      label: "Remove",
      disabled: true,
      title: "Built-in and environment-configured marketplace sources cannot be removed from workspace state.",
      visible: false,
    };
  }
  const removingThis = removingSourceId === source.id;
  return {
    label: removingThis ? "Removing" : "Remove",
    disabled: Boolean(removingSourceId),
    title: removingThis
      ? "Ambient is removing this Codex marketplace source."
      : "Remove this Codex marketplace source from Ambient workspace state.",
    visible: true,
  };
}

export function formatAmbientPluginSourceKind(sourceKind: AmbientPluginSummary["sourceKind"]): string {
  if (sourceKind === "codex-workspace") return "Codex workspace";
  if (sourceKind === "codex-cache") return "Codex cache";
  if (sourceKind === "codex-ambient-curated") return "Ambient curated";
  if (sourceKind === "codex-remote-marketplace") return "Codex remote";
  if (sourceKind === "pi-workspace") return "Pi workspace";
  if (sourceKind === "pi-ambient-workspace") return "Pi Ambient workspace";
  if (sourceKind === "pi-ambient-global") return "Pi Ambient global";
  if (sourceKind === "pi-project-settings") return "Pi project";
  if (sourceKind === "pi-user-settings") return "Pi user";
  if (sourceKind === "pi-gallery") return "Pi gallery";
  if (sourceKind === "ambient-cli") return "Ambient CLI";
  return "Ambient built-in";
}

export function formatAmbientCapabilityKind(kind: AmbientPluginCapabilitySummary["kind"]): string {
  if (kind === "mcp-tool") return "MCP tool";
  if (kind === "runtime-extension") return "Runtime extension";
  return formatPluginToken(kind);
}

export function formatAmbientAvailability(availability: AmbientPluginCapabilitySummary["availability"]): string {
  if (availability === "auth-required") return "Needs auth";
  if (availability === "untrusted") return "Needs trust";
  return formatPluginToken(availability);
}

export function formatAmbientRuntimeSupport(runtimes: AmbientPluginCapabilitySummary["runtimeSupport"]): string {
  return runtimes.map((runtime) => formatPluginToken(runtime)).join(", ");
}

export function formatPluginMcpRuntimeEvent(event: PluginMcpRuntimeEvent): string {
  const name = formatPluginMcpRuntimeEventName(event);
  const status = event.status === "succeeded" ? "ok" : event.status === "failed" ? "failed" : "started";
  const target = event.toolName ? `: ${event.toolName}` : "";
  const duration = event.durationMs !== undefined ? ` in ${event.durationMs}ms` : "";
  const detail = event.error ? ` - ${event.error}` : "";
  return `${name}${target} ${status}${duration}${detail}`;
}

export function formatPluginMcpLaunchCommand(input: { command?: string; args: string[] }): string {
  return [input.command ?? "(missing command)", ...input.args].join(" ");
}

function formatPluginMcpRuntimeEventName(event: PluginMcpRuntimeEvent): string {
  if (event.method === "initialize") return "Initialize";
  if (event.method === "tools/list") return "List tools";
  if (event.method === "tools/call") return "Call tool";
  if (event.method === "stderr") return "stderr";
  if (event.method === "crashed") return "Crash";
  if (event.method === "unhealthy") return "Unhealthy";
  if (event.method === "stop") return "Stop";
  if (event.method === "restart") return "Restart";
  return formatPluginToken(event.method);
}

export function workflowPluginRequirementRows(
  grants: WorkflowPluginCapabilityGrant[] | undefined,
  registry?: AmbientPluginRegistry,
): WorkflowPluginRequirementRow[] {
  return (grants ?? []).map((grant) => {
    const capability = registry?.capabilities.find(
      (item) => item.kind === "mcp-tool" && item.pluginId === grant.pluginId && item.serverName === grant.serverName,
    );
    if (!capability) {
      return {
        capabilityId: grant.capabilityId,
        pluginName: grant.pluginName,
        serverName: grant.serverName,
        toolName: grant.toolName,
        registeredName: grant.registeredName,
        availabilityLabel: registry ? "Unavailable" : "Not checked",
        availabilityReason: registry ? "Capability was not found in the plugin registry." : undefined,
        blocked: Boolean(registry),
      };
    }
    const automationSupported = capability.runtimeSupport.includes("automation");
    return {
      capabilityId: grant.capabilityId,
      pluginName: grant.pluginName,
      serverName: grant.serverName,
      toolName: grant.toolName,
      registeredName: grant.registeredName,
      availabilityLabel: automationSupported ? formatAmbientAvailability(capability.availability) : "Not exposed to automations",
      availabilityReason: automationSupported ? capability.availabilityReason : "Capability is not exposed to automations.",
      blocked: !automationSupported || capability.availability !== "available",
    };
  });
}

export function codexImportActionState(
  plugin: Pick<CodexPluginSummary, "compatibilityTier" | "imported" | "sourceKind" | "updateAvailable">,
): PluginActionState {
  const remoteCandidate = plugin.sourceKind === "remote-marketplace";
  const updateAvailable = Boolean(plugin.updateAvailable);
  if (plugin.imported) {
    return {
      label: remoteCandidate ? "Registered" : "Imported",
      disabled: true,
      title: remoteCandidate ? "This remote Codex plugin source is already registered." : "This Codex plugin is already imported.",
      visible: true,
    };
  }
  if (plugin.compatibilityTier === "unsupported") {
    return {
      label: updateAvailable ? "Update" : remoteCandidate ? "Register" : "Import",
      disabled: true,
      title: "Unsupported Codex plugins cannot be imported until Ambient can expose at least one usable capability.",
      visible: true,
    };
  }
  return {
    label: updateAvailable ? "Update" : remoteCandidate ? "Register" : "Import",
    disabled: false,
    title: updateAvailable
      ? "Update this Ambient-imported Codex plugin from its remote marketplace source."
      : remoteCandidate
        ? "Register this remote Codex plugin source in the Ambient workspace marketplace."
        : "Import this Codex plugin into the Ambient workspace marketplace.",
    visible: true,
  };
}

export function piPackageInstallActionState(
  pkg: Pick<PiPackageSummary, "installed" | "packageSpec">,
  installing: boolean,
  scope: PiPackageInstallScope = "workspace",
): PluginActionState {
  if (!pkg.packageSpec) {
    return {
      label: "Install",
      disabled: true,
      title: "No installable Pi package source is available for this entry.",
      visible: false,
    };
  }
  if (pkg.installed) {
    return {
      label: "Installed",
      disabled: true,
      title: "This Pi package is already registered in Ambient-managed package state.",
      visible: false,
    };
  }
  if (installing) {
    return {
      label: "Install",
      disabled: true,
      title: "Another Pi package install is already in progress.",
      visible: true,
    };
  }
  return {
    label: "Install",
    disabled: false,
    title: `Register this Pi package in Ambient-managed ${scope} package state without executing package code.`,
    visible: true,
  };
}

export function piPackageUninstallActionState(
  pkg: Pick<PiPackageSummary, "id" | "installed">,
  uninstallingPackageId?: string,
): PluginActionState {
  if (!pkg.installed) {
    return {
      label: "Uninstall",
      disabled: true,
      title: "Only Ambient-installed Pi packages can be uninstalled from this view.",
      visible: false,
    };
  }
  const uninstallingThis = uninstallingPackageId === pkg.id;
  return {
    label: uninstallingThis ? "Removing" : "Uninstall",
    disabled: Boolean(uninstallingPackageId),
    title: uninstallingThis
      ? "Ambient is removing this Pi package from managed package state."
      : "Remove this Pi package from Ambient-managed package state without changing Pi settings.",
    visible: true,
  };
}

export function piExtensionSandboxUninstallActionState(
  pkg: { id: string },
  uninstallingPackageId?: string,
): PluginActionState {
  const uninstallingThis = uninstallingPackageId === pkg.id;
  return {
    label: uninstallingThis ? "Removing" : "Uninstall",
    disabled: Boolean(uninstallingPackageId),
    title: uninstallingThis
      ? "Ambient is removing this sandboxed Pi extension package and revoking related grants."
      : "Remove this sandboxed Pi extension package from Ambient-managed state.",
    visible: true,
  };
}

export function piPrivilegedDisableActionState(
  pkg: { id: string; status: string },
  busyPackageId?: string,
): PluginActionState {
  const busyThis = busyPackageId === pkg.id;
  const disabled = pkg.status === "disabled";
  return {
    label: busyThis ? "Disabling" : "Disable",
    disabled: Boolean(busyPackageId) || disabled,
    title: disabled
      ? "This privileged Pi package is already disabled; no hooks, MCP servers, or commands are active through Ambient."
      : "Disable Ambient-managed privileged registrations without deleting package data.",
    visible: true,
  };
}

export function piPrivilegedUninstallActionState(
  pkg: { id: string },
  busyPackageId?: string,
): PluginActionState {
  const busyThis = busyPackageId === pkg.id;
  return {
    label: busyThis ? "Removing" : "Uninstall",
    disabled: Boolean(busyPackageId),
    title: busyThis
      ? "Ambient is removing this privileged Pi install and revoking related grants."
      : "Remove this privileged Pi install from Ambient-managed state. Only manifest-owned files are removed.",
    visible: true,
  };
}

export function piPackageEnableActionState(
  pkg: Pick<PiPackageSummary, "installed" | "enabled" | "compatibilityTier" | "resourceCounts">,
  enabling: boolean,
): PluginActionState {
  if (!pkg.installed) {
    return {
      label: "Disabled",
      disabled: true,
      title: "Install this Pi package in Ambient before enabling its declarative resources.",
      visible: false,
    };
  }
  if (pkg.compatibilityTier === "unsupported") {
    return {
      label: pkg.enabled ? "Enabled" : "Disabled",
      disabled: true,
      title: "Unsupported Pi packages cannot be enabled.",
      visible: true,
    };
  }
  if (pkg.resourceCounts.extension > 0) {
    return {
      label: pkg.enabled ? "Enabled" : "Disabled",
      disabled: true,
      title: "Pi packages with extensions cannot be enabled until Ambient has Pi extension trust and sandboxing.",
      visible: true,
    };
  }
  return {
    label: pkg.enabled ? "Enabled" : "Disabled",
    disabled: enabling,
    title: pkg.enabled
      ? "Disable this package's declarative Pi resources for new chat sessions."
      : "Enable declarative Pi resources without running package extension code.",
    visible: true,
  };
}

function formatPluginToken(value: string): string {
  return value
    .split(/[-_]/)
    .filter(Boolean)
    .map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`)
    .join(" ");
}
