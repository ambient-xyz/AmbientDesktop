import type { ProviderCatalogEntry } from "./providerCatalogTypes";

const reviewedAt = "2026-05-11";

export const providerCatalogSpeechEntries: ProviderCatalogEntry[] = [
  {
    id: "stt.qwen-asr",
    displayName: "Qwen ASR",
    capabilityArea: "voice-recognition",
    installerShape: "stt-provider",
    providerKind: "local",
    sourceModel: "open-source",
    recommendationTier: "recommended",
    recommendationSummary:
      "Primary local/open ASR path for Ambient voice recognition where the first-party Qwen3-ASR runtime fits the host.",
    recommendationMemo: {
      deploymentRole: "primary",
      recommendation:
        "Use Qwen ASR as the favored first-party local STT path for Ambient push-to-talk and core app voice recognition, but validate through the Ambient STT provider path rather than direct CLI-only runs.",
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
    tradeoffs: [
      "Model assets and runtime can be heavy",
      "Streaming behavior needs continued validation",
      "Internal STT spike data showed multilingual quality can lag faster-whisper on a small corpus",
    ],
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
    maintenanceNotes: [
      "Track runtime compatibility, model cache size, asset manifest revision, and language-prompting guidance per platform.",
    ],
    safetyBoundaries: ["Do not record microphone input without explicit user action."],
    knownQuirks: [
      "Streaming and chunking behavior needs platform-specific evidence.",
      "For some multilingual samples, explicit language prompting and no-speech pre-gating are important product boundaries.",
      "Ambient STT status can discover the bundled provider before runtime/model assets are ready; Pi must treat `available=false` plus `validation=needs-runtime` as a setup blocker, not a selectable provider.",
    ],
    researchStatus: "live-dogfooded",
    evidence: [
      { date: reviewedAt, type: "manual-note", summary: "Favored ASR path per current provider plan." },
      {
        date: reviewedAt,
        type: "local-smoke",
        summary:
          "Bundled ambient-qwen3-asr package, validation harness, asset manifest checks, and live Linux GPU transcription evidence exist in the STT implementation plan.",
      },
      {
        date: reviewedAt,
        type: "local-smoke",
        summary:
          "Phase 5 live Pi dogfood installed the bundled ambient-qwen3-asr package with runtime autodetect/download disabled, persisted `needs-runtime` validation metadata for a missing llama-mtmd-cli path, and verified `ambient_stt_status` surfaced Qwen3-ASR as unavailable with the pinned qwen3-asr-0.6b-q8_0 asset revision instead of selecting or testing it.",
      },
    ],
    docs: [
      { label: "Qwen3-ASR model card", url: "https://huggingface.co/Qwen/Qwen3-ASR-1.7B", lastReviewed: reviewedAt },
      {
        label: "Qwen ASR package assets",
        url: "resources/ambient-cli-packages/ambient-qwen3-asr/assets/qwen3-asr-assets.json",
        lastReviewed: reviewedAt,
      },
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
      recommendation:
        "Keep faster-whisper as the local control baseline and fallback when Qwen ASR is unsupported, unavailable, or lower quality for the user's language/audio profile.",
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
      {
        date: reviewedAt,
        type: "local-smoke",
        summary: "Internal STT spike includes faster-whisper large-v3-turbo as a multilingual quality and speed baseline.",
      },
      {
        date: reviewedAt,
        type: "local-smoke",
        summary:
          "Phase 5 local STT smoke ran scripts/stt-spike/providers.faster-whisper-tiny-smoke.json on macOS arm64 with uv, faster-whisper==1.1.1 plus explicit requests, tiny.en, CPU int8, and the public English HF ASR dummy WAV; the harness succeeded with language=en, language match yes, RTF 0.093 on a warm/cache run, and preserved summary/results/transcript artifacts under .ambient/stt-spike/runs/mac-faster-whisper-tiny-en-20260511/2026-05-11T16-48-08-821Z.",
      },
      {
        date: reviewedAt,
        type: "pi-live-dogfood",
        summary:
          "Phase 5 live Ambient/Pi product-path dogfood installed the bundled ambient-faster-whisper-stt package in a temp workspace, prepared the public English HF ASR dummy WAV, and had Pi call ambient_stt_status, approval-gated ambient_stt_select, and approval-gated ambient_stt_test; the real local faster-whisper tiny.en provider returned the expected transcript phrase `He hoped there would be stew` and the test recorded allowed selection/test permission audits.",
      },
      {
        date: reviewedAt,
        type: "local-smoke",
        summary:
          "Phase 5 adapter-contract hardening made the bundled package report adapter-only distribution and uv-based install plan details in health output, with tests covering fake mode and missing-uv guidance so Pi can distinguish package presence from runtime/model asset readiness.",
      },
      {
        date: reviewedAt,
        type: "local-smoke",
        summary:
          "Phase 5 clean-cache validation added scripts/stt-faster-whisper-clean-cache-validation.mjs and ran it on macOS arm64 with isolated uv/Python/Hugging Face/XDG caches; the real tiny.en CPU path resolved about 895 MB of runtime/model cache state, reported packageType=adapter-only and bundled asset flags false, and transcribed the public English HF ASR dummy WAV with the expected stew phrase in about 21.7s provider elapsed time.",
      },
      {
        date: reviewedAt,
        type: "local-smoke",
        summary:
          "Phase 5 Linux clean-cache validation ran the same script over SSH on drone, an Ubuntu x64 host with an NVIDIA RTX 4090, using AMBIENT_FASTER_WHISPER_UV=/home/ambient/.local/bin/uv, device=cuda, compute=float16; the adapter stayed packageType=adapter-only with all bundled asset flags false, resolved about 2.66 GB into isolated uv/Hugging Face/XDG caches, and transcribed the public English HF ASR dummy WAV with language=en and the expected stew phrase in about 7.4s provider elapsed time.",
      },
    ],
    docs: [
      { label: "faster-whisper", url: "https://github.com/SYSTRAN/faster-whisper", lastReviewed: reviewedAt },
      {
        label: "Ambient faster-whisper STT package",
        url: "resources/ambient-cli-packages/ambient-faster-whisper-stt",
        lastReviewed: reviewedAt,
      },
      {
        label: "Ambient faster-whisper STT package instructions",
        url: "resources/ambient-cli-packages/ambient-faster-whisper-stt/SKILL.md",
        lastReviewed: reviewedAt,
      },
      {
        label: "faster-whisper clean-cache validation",
        url: "scripts/stt-faster-whisper-clean-cache-validation.mjs",
        lastReviewed: reviewedAt,
      },
      {
        label: "faster-whisper tiny smoke provider config",
        url: "scripts/stt-spike/providers.faster-whisper-tiny-smoke.json",
        lastReviewed: reviewedAt,
      },
      { label: "faster-whisper STT live product-path dogfood", url: "src/main/plugins/pluginDogfood.test.ts", lastReviewed: reviewedAt },
      { label: "STT spike plan", url: "STTSpikePlan.md", lastReviewed: reviewedAt },
    ],
  },
];
