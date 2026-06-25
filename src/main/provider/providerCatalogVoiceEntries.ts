import type { ProviderCatalogEntry } from "./providerCatalogTypes";

const reviewedAt = "2026-05-11";

export const providerCatalogVoiceEntries: ProviderCatalogEntry[] = [
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
      recommendation:
        "Use Piper as the default local/offline TTS provider when the user wants reliable voice output, no cloud upload, and the fastest path to a working Ambient voice-provider contract.",
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
    modelAssets: [
      { name: "Piper voice model", licenseNote: "Review selected voice asset license.", cachePolicy: "Workspace or provider cache." },
    ],
    runtimeState: { externalService: false, serviceKind: "none" },
    costPrivacyNotes: ["No cloud upload required after model assets are present."],
    maintenanceNotes: [
      "Pin model assets, voice config, piper package/binary version, sample rate, and supported output format in the provider card.",
    ],
    safetyBoundaries: ["Do not imply voice cloning support unless a provider declares it separately."],
    knownQuirks: [
      "Voice quality depends heavily on the selected model.",
      "Asset-backed validation succeeds only after the ONNX voice model and JSON config are placed under the provider-local models directory; missing assets fail fast with a clear setup error.",
    ],
    researchStatus: "live-dogfooded",
    evidence: [
      { date: reviewedAt, type: "manual-note", summary: "Seeded from existing Ambient TTS onboarding plan." },
      {
        date: reviewedAt,
        type: "pi-live-dogfood",
        summary:
          "Existing live Capability Builder dogfood covers Piper planning, scaffolding, dependency install, validation, registration, re-registration, Ambient CLI describe/run, and WAV artifact generation.",
      },
      {
        date: reviewedAt,
        type: "local-smoke",
        summary:
          "Phase 5 live Pi dogfood copied cached en_US-lessac-medium Piper model/config files into the provider-local models directory through approval-gated Builder install_deps, validated and registered the local tts-provider, selected it for voice output, and generated real WAV artifacts through both provider-contract validation and a fresh installed ambient_cli run.",
      },
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
    recommendationSummary:
      "Higher-quality local TTS candidate for Apple Silicon and local/offline voice experiments once model assets are validated.",
    recommendationMemo: {
      deploymentRole: "fallback",
      recommendation:
        "Use Kokoro ONNX as the local quality fallback when Piper is too robotic and the user accepts model asset downloads, ONNX runtime setup, and stricter platform validation.",
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
    tradeoffs: [
      "More dependency/model asset risk than Piper",
      "Asset provenance and runtime compatibility need validation",
      "Keep text chunks short; observed Kokoro ONNX runs can fail around the upstream 510-phoneme boundary.",
    ],
    avoidWhen: ["The user wants the fastest reliable local TTS baseline"],
    platforms: ["macos-arm64", "linux-x64"],
    hardwareFit: ["Best on Apple Silicon or a local machine with a tuned Python/ONNX runtime"],
    firstPartyTemplate: {
      available: true,
      templateId: "tts-provider:kokoro-onnx",
      notes: "Use the dogfooded ONNX path before considering heavier Kokoro/MLX variants.",
    },
    capabilityBuilderDefaults: {
      provider: "Kokoro ONNX",
      locality: "local",
      outputFileArtifacts: ["wav"],
      networkHosts: ["github.com"],
      modelAssets: ["kokoro-v1.0.int8.onnx", "voices-v1.0.bin"],
    },
    ambientContract: {
      commandContract: "TTS command writes a declared WAV artifact and descriptor declares local voiceProvider metadata.",
      descriptorRequirements: [
        "installerShape tts-provider",
        "voiceProvider command metadata",
        "audio artifact output",
        "model asset declarations",
      ],
      artifactPolicy: "Write audio artifacts to user-visible workspace paths during validation.",
      validationTarget: "Generate a tiny WAV from fixed text through the Kokoro ONNX voice provider contract.",
    },
    secrets: [],
    networkHosts: ["github.com"],
    modelAssets: [
      {
        name: "kokoro-v1.0.int8.onnx",
        licenseNote: "Review selected model asset release terms.",
        cachePolicy: "Provider-local models directory.",
      },
      {
        name: "voices-v1.0.bin",
        licenseNote: "Review selected voice asset release terms.",
        cachePolicy: "Provider-local models directory.",
      },
    ],
    runtimeState: { externalService: false, serviceKind: "none" },
    costPrivacyNotes: ["No cloud upload required after model assets are present."],
    maintenanceNotes: [
      "Pin model assets, voices asset, runtime package, phonemizer/espeak-ng expectations, language/voice id, supported platform, and max synthesis chunk length before promotion.",
    ],
    safetyBoundaries: ["Do not switch to another Kokoro runtime path without explicit user approval."],
    knownQuirks: [
      "ONNX runtime and model asset locations are the main setup risks.",
      "Long text can trip the Kokoro ONNX phoneme limit; use short validation text and chunk assistant replies to roughly 1,000 characters or less until the provider wrapper enforces a safer limit.",
    ],
    researchStatus: "researched",
    evidence: [
      { date: reviewedAt, type: "manual-note", summary: "Seeded from existing Ambient Kokoro ONNX TTS template." },
      {
        date: reviewedAt,
        type: "local-smoke",
        summary: "Unit coverage verifies Kokoro ONNX scaffold shape, model asset declarations, and clear missing-asset validation failure.",
      },
    ],
    docs: [
      { label: "Kokoro ONNX repository", url: "https://github.com/thewh1teagle/kokoro-onnx", lastReviewed: reviewedAt },
      {
        label: "Kokoro ONNX model release",
        url: "https://github.com/thewh1teagle/kokoro-onnx/releases/tag/model-files-v1.0",
        lastReviewed: reviewedAt,
      },
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
    recommendationSummary:
      "High-quality hosted TTS candidate when the user accepts cost, network upload, and provider account requirements.",
    recommendationMemo: {
      deploymentRole: "fallback",
      recommendation:
        "Use ElevenLabs as the premium hosted voice-quality path when the user accepts cloud text upload, API cost/quota, and Ambient-managed secret capture.",
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
    maintenanceNotes: [
      "Review current API model ids, voice ids, output formats, quota/rate-limit behavior, and provider retention policy before marking recommended.",
    ],
    safetyBoundaries: ["Voice cloning requires separate consent and provider-specific guardrails."],
    knownQuirks: ["Dynamic voice ids and quotas can vary by account."],
    researchStatus: "live-dogfooded",
    evidence: [
      { date: reviewedAt, type: "docs-review", summary: "Cloud TTS candidate seeded for credentialed dogfood." },
      {
        date: reviewedAt,
        type: "pi-live-dogfood",
        summary:
          "Existing live cloud TTS dogfood covers ElevenLabs planning, scaffolding, secret request/save, validation, registration, voice-provider selection, rollback registration, and real audio artifact generation when the dogfood secret is available.",
      },
      {
        date: reviewedAt,
        type: "credentialed-smoke",
        summary:
          "Phase 5 live Pi dogfood reran the approved ElevenLabs cloud TTS full-flow using ELEVENLABS_API_KEY from an approved ignored secret file, requested and saved the Builder-scoped Desktop secret, validated and registered the provider, selected it for voice output, generated a real MP3 rollback artifact, and verified the key was absent from transcript, audit, registration, and command output.",
      },
    ],
    docs: [
      {
        label: "ElevenLabs Text to Speech API",
        url: "https://elevenlabs.io/docs/api-reference/text-to-speech/convert",
        lastReviewed: reviewedAt,
      },
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
    recommendationSummary:
      "Low-latency hosted TTS candidate when the user accepts API credentials, cloud upload, cost, and provider terms.",
    recommendationMemo: {
      deploymentRole: "fallback",
      recommendation:
        "Use Cartesia as the hosted low-latency voice path when responsiveness matters and the user accepts cloud text upload, API cost/quota, and Ambient-managed secret capture.",
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
    maintenanceNotes: [
      "Review current API version, Sonic model ids, voice ids, output formats, latency claims, and migration deadlines before marking recommended.",
    ],
    safetyBoundaries: ["Voice cloning requires separate consent and provider-specific guardrails."],
    knownQuirks: ["API version and voice ids can change independently of the Ambient scaffold."],
    researchStatus: "live-dogfooded",
    evidence: [
      { date: reviewedAt, type: "docs-review", summary: "Cloud TTS candidate seeded from existing Ambient Cartesia template." },
      {
        date: reviewedAt,
        type: "pi-live-dogfood",
        summary:
          "Existing live cloud TTS dogfood covers Cartesia planning, scaffolding, secret request/save, validation, registration, voice-provider selection, rollback registration, and real audio artifact generation when the dogfood secret is available.",
      },
      {
        date: reviewedAt,
        type: "credentialed-smoke",
        summary:
          "Phase 5 live Pi dogfood reran the approved Cartesia cloud TTS full-flow using CARTESIA_API_KEY from an approved ignored secret file, requested and saved the Builder-scoped Desktop secret, validated and registered the provider, selected it for voice output, generated a real WAV rollback artifact, and verified the key was absent from transcript, audit, registration, and command output.",
      },
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
      recommendation:
        "Keep xAI Grok TTS as a research candidate: xAI now documents a TTS API, output formats, voices, speech tags, and streaming support, but Ambient should not recommend it until a credentialed wrapper is dogfooded end-to-end.",
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
    knownQuirks: [
      "Ambient has not dogfooded this provider path yet.",
      "The xAI path should not displace ElevenLabs or Cartesia until it has equivalent secret, artifact, and voice-provider lifecycle coverage.",
    ],
    researchStatus: "researched",
    evidence: [
      { date: reviewedAt, type: "docs-review", summary: "xAI documents voice/TTS APIs, but Ambient has not credential-tested them." },
    ],
    docs: [
      { label: "xAI voice docs", url: "https://docs.x.ai/developers/model-capabilities/audio/voice", lastReviewed: reviewedAt },
      {
        label: "xAI Text to Speech API",
        url: "https://docs.x.ai/developers/model-capabilities/audio/text-to-speech",
        lastReviewed: reviewedAt,
      },
    ],
  },
];
