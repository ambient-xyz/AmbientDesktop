import type { ProviderCatalogEntry } from "./providerCatalogTypes";
import { miniCpmRemoteEndpointReviewChecklistText } from "../../shared/miniCpmRemoteEndpointSecurity";

const reviewedAt = "2026-05-11";

export const providerCatalogVisionEntries: ProviderCatalogEntry[] = [
  {
    id: "vision.minicpm-v",
    displayName: "MiniCPM-V",
    capabilityArea: "visual-understanding",
    installerShape: "vision-analysis-provider",
    providerKind: "local",
    sourceModel: "open-source",
    recommendationTier: "recommended",
    recommendationSummary:
      "Recommended local visual-evidence provider for scoped macOS arm64 and Linux x64 managed-runtime installs, with MiniCPM-V 4.5 Q4_K_M as the tested screenshot, UI/game-frame, user-image, and sampled-video baseline while GLM remains the primary reasoning model.",
    recommendationMemo: {
      deploymentRole: "primary",
      recommendation:
        "Use MiniCPM-V 4.5 Q4_K_M as the recommended local visual-understanding provider on scoped macOS arm64 and Linux x64 managed-runtime lanes when the task is to inspect bounded images, screenshots, UI/game frames, or sampled video and return structured evidence for Pi/GLM to reason over.",
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
    bestFor: [
      "Local screenshot analysis",
      "UI and game visual QA",
      "OCR-like image inspection",
      "Multi-image comparison",
      "Sampled video frame review",
    ],
    tradeoffs: [
      "4.6 is faster in current Linux GPU smoke but produced more generic visual observations",
      "Vision output can be plausible but wrong",
      "Local runtime and model download setup is still more complex than hosted multimodal APIs",
    ],
    avoidWhen: [
      "The user needs guaranteed visual correctness",
      "The task requires direct file mutation instead of evidence gathering",
      "The machine cannot run local model assets or a trusted endpoint",
    ],
    platforms: ["macos-arm64", "macos-x64", "windows-x64", "linux-x64"],
    platformSupport: [
      {
        platform: "macos-arm64",
        status: "supported",
        runtime: "llama.cpp Metal with MiniCPM-V 4.5 Q4_K_M GGUF and f16 vision projector",
        installMode:
          "Recommended default Ambient-managed macOS arm64 runtime download, with user-approved pinned archives and user-managed llama.cpp runtimes retained as advanced alternatives. Managed installs write into .ambient/vision/minicpm-v/runtime after archive and extracted-binary checksum verification. Desktop removes macOS quarantine from the managed copy only after checksum verification, records signing/Gatekeeper facts in the receipt, and marks the managed copy promotion-eligible when it is quarantine-free with a valid code signature. The manifest/checksum verifier pins llama.cpp b9122 macOS arm64 artifact URLs, archive checksums, and extracted llama-server checksums; pinned b9122 lifecycle smoke now passes on Apple Silicon Metal.",
        evidence: [
          "Mac llama.cpp 4.5 screenshot smoke",
          "Pinned b9122 macOS arm64 Metal runtime lifecycle smoke",
          "Default managed-download macOS arm64 lifecycle smoke with checksum receipt",
          "Descriptor-backed Ambient CLI package",
          "Managed local-archive runtime install with checksum receipt",
          "macOS quarantine removal/signing assessment receipt for app-managed runtime cache",
          "Live Ambient/Pi ambient_cli screenshot dogfood",
          "Live Ambient/Pi typed setup/analyze dogfood through default managed runtime download",
        ],
        caveats: [
          "Recommended macOS support is scoped to Apple Silicon; Intel macOS remains experimental until separate smoke evidence exists.",
          "Model/projector assets still download through llama.cpp/Hugging Face caches until Ambient-managed model caching is implemented.",
        ],
      },
      {
        platform: "linux-x64",
        status: "supported",
        runtime: "llama.cpp Vulkan on Ubuntu with NVIDIA RTX 4090; CUDA path remains acceptable if the installed runtime supports it",
        installMode:
          "Recommended default Ambient-managed Linux x64 Vulkan runtime download, with user-approved pinned archives and user-managed Linux x64 runtimes retained as advanced alternatives after preflight. Managed installs write into .ambient/vision/minicpm-v/runtime after archive and extracted-binary checksum verification. The manifest/checksum verifier pins llama.cpp b9122 Ubuntu Vulkan x64 artifact URLs, archive checksums, and extracted llama-server checksums; pinned b9122 lifecycle smoke now passes on the `drone` RTX 4090 Vulkan lane while Docker/Podman stays an advanced fallback until lifecycle UX is designed.",
        evidence: [
          "Linux `drone` RTX 4090 4.5/4.6 quality comparison",
          "Linux `drone` MiniCPM-V 4.5 runtime lifecycle smoke",
          "Pinned b9122 Linux x64 Vulkan runtime lifecycle smoke on `drone`",
          "Default managed-download Linux x64 Vulkan lifecycle smoke on `drone`",
          "Managed local-archive runtime install with checksum receipt",
        ],
        caveats: [
          "Recommended Linux support is scoped to the GPU lane validated on `drone`; CPU-only Linux has not been performance-qualified.",
          "Linux support depends on matching llama.cpp GPU backend, driver, and model-cache state.",
        ],
      },
      {
        platform: "macos-x64",
        status: "experimental",
        runtime: "llama.cpp CPU or non-Metal acceleration if available",
        installMode: "User-managed runtime only until an Intel macOS smoke exists.",
        evidence: ["Upstream llama.cpp/GGUF support only"],
        caveats: [
          "No current Intel macOS validation evidence.",
          "Expected latency may be poor enough that the provider should not be recommended by default.",
        ],
      },
      {
        platform: "windows-x64",
        status: "experimental",
        runtime: "llama.cpp Windows x64 CPU prebuilt binary or WSL advanced fallback",
        installMode:
          "The blocked manifest now pins the b9122 Windows x64 CPU zip archive and extracted llama-server.exe checksum, and Desktop's managed installer can extract zip archives into .ambient/vision/minicpm-v/runtime. Ambient should not label Windows generally supported until a real Windows smoke covers process lifecycle, path quoting, firewall, and cache behavior.",
        evidence: ["Pinned b9122 Windows x64 CPU zip artifact metadata", "Managed zip runtime archive install path"],
        caveats: [
          "No real Windows smoke evidence yet.",
          "Path quoting, local firewall prompts, process cleanup, GPU backend selection, CPU fallback latency, and model-cache paths remain open validation risks.",
        ],
      },
    ],
    hardwareFit: [
      "MiniCPM-V 4.5 Q4_K_M used about 5.3 GiB of RTX 4090 VRAM at 4k context in llama.cpp Vulkan smoke; plan for at least 8 GB VRAM headroom for the baseline. MiniCPM-V 4.6 is lighter and faster but remains quality-experimental.",
    ],
    firstPartyTemplate: {
      available: true,
      templateId: "vision-analysis-provider:minicpm-v-llamacpp",
      notes:
        "Use the bundled ambient-minicpm-v-vision Ambient CLI package as the recommended managed-runtime path on scoped macOS arm64/Linux x64 hosts; explicit runtime sources remain available for advanced endpoints and experimental lanes.",
    },
    capabilityBuilderDefaults: {
      provider: "MiniCPM-V",
      locality: "local",
      outputFileArtifacts: ["json"],
      responseFormats: ["json", "text"],
      networkHosts: ["github.com", "huggingface.co", "ollama.com"],
      modelAssets: ["openbmb/MiniCPM-V-4_5-gguf", "openbmb/MiniCPM-V-4.6 experimental comparison"],
    },
    ambientContract: {
      commandContract:
        "Vision analyzer accepts bounded image/screenshot/sampled-video inputs plus a task prompt, then returns validated JSON observations and a concise summary for Pi/GLM.",
      descriptorRequirements: [
        "installerShape vision-analysis-provider",
        "model asset declarations",
        "runtime acquisition/cache/preflight contract",
        "runtime release manifest/checksum verifier",
        "runtime start/stop/status commands",
        "input media policy",
        "structured JSON output schema",
        "full-output artifact preservation",
      ],
      artifactPolicy:
        "Persist full raw model output, runtime logs, request metadata, media metadata, and schema-validation results as artifacts; return only bounded structured observations to Pi.",
      validationTarget:
        "Analyze one checked-in fixture image or local screenshot through the Ambient-mediated provider path and verify valid JSON, non-empty observations, confidence/limitations fields, model/runtime metadata, and no secret/path leakage.",
    },
    secrets: [],
    networkHosts: ["github.com", "huggingface.co", "ollama.com", "localhost"],
    modelAssets: [
      {
        name: "openbmb/MiniCPM-V-4_5-gguf",
        sourceUrl: "https://huggingface.co/openbmb/MiniCPM-V-4_5-gguf",
        expectedSize:
          "Q4_K_M GGUF tested baseline; text model is about 4.7 GiB and the f16 vision projector is about 1.0 GiB in the llama.cpp cache.",
        licenseNote: "Apache-2.0 on the Hugging Face model card.",
        cachePolicy: "Ambient model cache or user-managed runtime cache.",
      },
      {
        name: "openbmb/MiniCPM-V-4.6",
        sourceUrl: "https://huggingface.co/openbmb/MiniCPM-V-4.6",
        expectedSize:
          "GGUF listed around 2 GB CPU memory; GPU variants listed around 3-4 GB memory. Current Linux smoke is faster but lower quality than 4.5 on Ambient UI fixtures.",
        licenseNote: "Apache-2.0 per OpenBMB MiniCPM-V repo; confirm exact model-card license for the pinned revision.",
        cachePolicy: "Ambient model cache or user-managed llama.cpp/Ollama/vLLM/SGLang cache.",
      },
    ],
    localArtifactReadiness: {
      status: "local-ready",
      verifiedArtifacts: [
        "OpenBMB MiniCPM-V repo",
        "MiniCPM-V 4.6 framework and model-zoo notes",
        "MiniCPM-V 4.5 GGUF llama.cpp/Ollama/vLLM/SGLang usage notes",
        "Apache-2.0 license metadata",
        "Mac llama.cpp 4.5 screenshot smoke",
        "Linux `drone` RTX 4090 4.5/4.6 quality comparison",
        "Descriptor-backed Ambient CLI vision wrapper package",
        "Runtime acquisition/cache/preflight contract for user-managed llama-server and Ambient-managed download",
        "Runtime release manifest/checksum verifier with pinned llama.cpp b9122 macOS/Linux archives plus Windows x64 CPU zip and binary checksums",
        "Default managed runtime download path for pinned macOS arm64/Linux x64 artifacts",
        "Pinned b9122 macOS/Linux runtime lifecycle smoke with checksum verification and clean shutdown",
        "Fresh empty-cache default-download lifecycle smoke on Mac and `drone`",
        "Pinned b9122 Windows x64 CPU zip artifact metadata with archive/binary checksums",
        "Managed local-archive runtime install with archive/binary checksum receipt and env binding",
        "Managed zip runtime archive install path",
        "macOS quarantine removal/signing assessment receipt for app-managed runtime cache",
        "Live Ambient/Pi ambient_cli MiniCPM-V screenshot dogfood",
        "Live Ambient/Pi typed setup/analyze dogfood through default managed runtime download",
      ],
      missingOrBlockingArtifacts: ["Windows x64 smoke for Windows support only; not blocking scoped macOS/Linux recommendation"],
      minimumLocalSmokeTest:
        "Install the pinned managed runtime for macOS arm64 or Linux x64 from an empty cache, verify archive and extracted-binary checksums, analyze one fixture screenshot through the typed Ambient visual tool, and verify valid structured observations plus full artifact preservation.",
    },
    runtimeState: {
      externalService: true,
      serviceKind: "local-daemon",
      statePaths: [
        "llama.cpp/Ollama/vLLM/SGLang process logs",
        ".ambient/vision/minicpm-v/runtime Ambient-managed runtime cache",
        "llama.cpp/Hugging Face model cache",
        "request/response artifacts",
        "schema validation artifact",
      ],
      healthCheck:
        "Runtime acquisition contract, executable preflight, runtime release manifest/checksum verification, model-cache policy, local endpoint liveness, and one tiny fixture-image analysis.",
      updatePolicy: "Pinned model/runtime revisions for dogfood; no automatic runtime or model upgrades.",
    },
    costPrivacyNotes: [
      "Local analysis avoids image upload after model assets are present; model downloads still contact declared hosts and may consume several GB of disk/network.",
      `Remote MiniCPM-V endpoints remain disabled until the hosted-endpoint security review covers ${miniCpmRemoteEndpointReviewChecklistText()}.`,
    ],
    maintenanceNotes: [
      "Track MiniCPM-V model revision, quantization, llama.cpp/Ollama/vLLM/SGLang runtime version, runtime acquisition mode, release-manifest/checksum pinning, cache ownership, image preprocessor behavior, prompt/schema examples, and per-platform latency/memory metrics.",
    ],
    safetyBoundaries: [
      "Read-only visual evidence tool; no file mutation; reject unbounded remote URLs; require permission for outside-workspace image reads; report uncertainty instead of rewriting visual conclusions.",
      `Reject non-local endpointUrl values until the remote-endpoint security review covers ${miniCpmRemoteEndpointReviewChecklistText()}.`,
    ],
    knownQuirks: [
      "MiniCPM-V 4.6 is newly released and may have changing runtime support.",
      "The 4.5 GGUF path is currently the stronger llama.cpp/Ollama smoke baseline.",
      "Vision models may miss small UI details, text, or state unless the prompt and image resolution are appropriate.",
      "llama-server must be shut down after each smoke run; stale processes can hold VRAM and cause misleading insufficient-memory failures.",
    ],
    researchStatus: "live-dogfooded",
    evidence: [
      {
        date: reviewedAt,
        type: "docs-review",
        summary:
          "OpenBMB MiniCPM-V docs reviewed for 4.6 model features, GGUF/runtime support, model-zoo memory notes, 4.5 GGUF llama.cpp commands, and Apache-2.0 licensing metadata.",
      },
      {
        date: reviewedAt,
        type: "local-smoke",
        summary:
          "Mac llama.cpp and Linux `drone` RTX 4090 smoke tests passed with MiniCPM-V 4.5 Q4_K_M against Ambient screenshots; Linux 4.6 passed but produced more generic observations on the same fixtures. The descriptor-backed Ambient CLI package now starts/stops the local llama-server endpoint and validates structured screenshot output.",
      },
      {
        date: reviewedAt,
        type: "pi-live-dogfood",
        summary:
          "Ambient/Pi live dogfood installed the MiniCPM-V Ambient CLI package, searched/described it, ran start/analyze/stop through ambient_cli on an Ambient Desktop screenshot, produced valid schema output, and preserved a redacted evidence summary under test-results/minicpm-v/pi-dogfood/.",
      },
      {
        date: reviewedAt,
        type: "pi-live-dogfood",
        summary:
          "Ambient/Pi typed live dogfood used ambient_visual_minicpm_setup with the default managed runtime download, then ambient_visual_analyze against an Ambient Desktop screenshot; runtime install source, checksums, macOS promotion policy, and redacted visual evidence were preserved under test-results/minicpm-v/pi-dogfood/.",
      },
      {
        date: reviewedAt,
        type: "manual-note",
        summary:
          "Provider catalog promoted MiniCPM-V to recommended for scoped macOS arm64/Linux x64 managed-runtime installs while keeping macOS x64 and Windows x64 experimental until separate host evidence lands.",
      },
    ],
    docs: [
      { label: "OpenBMB MiniCPM-V repository", url: "https://github.com/OpenBMB/MiniCPM-V", lastReviewed: reviewedAt },
      { label: "MiniCPM-V 4.5 GGUF model card", url: "https://huggingface.co/openbmb/MiniCPM-V-4_5-gguf", lastReviewed: reviewedAt },
      { label: "MiniCPM-V 4.0 GGUF model card", url: "https://huggingface.co/openbmb/MiniCPM-V-4-gguf", lastReviewed: reviewedAt },
      { label: "Ollama MiniCPM-V 4.5", url: "https://ollama.com/openbmb/minicpm-v4.5", lastReviewed: reviewedAt },
      {
        label: "Ambient MiniCPM-V vision package",
        url: "resources/ambient-cli-packages/ambient-minicpm-v-vision",
        lastReviewed: reviewedAt,
      },
    ],
  },
];
