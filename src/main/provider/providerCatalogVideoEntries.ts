import type { ProviderCatalogEntry } from "./providerCatalogTypes";

const reviewedAt = "2026-05-11";

export const providerCatalogVideoEntries: ProviderCatalogEntry[] = [
  {
    id: "video.comfyui-local-workflows",
    displayName: "ComfyUI local video workflows",
    capabilityArea: "video-generation",
    installerShape: "artifact-generator",
    providerKind: "local",
    sourceModel: "open-source",
    recommendationTier: "conditional",
    recommendationSummary:
      "First local/open generative-video research path, with explicit workflow, model, codec, and runtime-state caveats.",
    recommendationMemo: {
      deploymentRole: "research",
      recommendation:
        "Use ComfyUI local video workflows as the first local/open generative-video research path, not as a default one-click install, because video workflows combine large model downloads, GPU/Metal fit, custom nodes, workflow provenance, codecs, and longer runtimes.",
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
      commandContract:
        "Artifact generator wraps a bounded ComfyUI video workflow run and returns video artifact metadata plus workflow/model/log paths.",
      descriptorRequirements: [
        "installerShape artifact-generator",
        "workflow JSON path",
        "model asset declarations",
        "codec dependency notes",
        "video artifact output",
      ],
      artifactPolicy: "Write video outputs, first-frame previews, ffprobe metadata, workflow JSON, and logs to workspace artifacts.",
      validationTarget:
        "Run the smallest viable video workflow and verify playable/structural validity, duration/frame metadata, bytes, and model/workflow state.",
    },
    secrets: [],
    networkHosts: ["github.com", "huggingface.co", "civitai.com"],
    modelAssets: [
      {
        name: "ComfyUI video workflow model assets",
        licenseNote: "Review each selected video model/checkpoint license.",
        cachePolicy: "Provider model cache; state must be declared before install.",
      },
    ],
    localArtifactReadiness: {
      status: "conditional-local",
      verifiedArtifacts: ["ComfyUI runtime", "video workflow docs/examples", "local model cache pattern", "video/frame output artifacts"],
      missingOrBlockingArtifacts: [
        "Selected video workflow/model bundle",
        "Validated Ambient wrapper lifecycle",
        "Codec dependency dogfood",
      ],
      minimumLocalSmokeTest:
        "Run a one-to-two-second low-resolution workflow and verify output bytes, duration/frame count, first-frame preview, model paths, and logs.",
    },
    runtimeState: {
      externalService: true,
      serviceKind: "local-daemon",
      statePaths: ["ComfyUI model cache", "workflow JSON", "output directory", "codec/temp files", "daemon logs"],
      healthCheck: "HTTP API or process liveness check before queueing a workflow.",
    },
    costPrivacyNotes: [
      "Local generation avoids prompt/media upload after model install, but electricity/runtime and download sources matter.",
    ],
    maintenanceNotes: [
      "Pin ComfyUI, custom nodes, workflow JSON, model revisions, ffmpeg/codec dependencies, and output format expectations.",
    ],
    safetyBoundaries: ["Require explicit approval before downloading large models or unreviewed custom nodes."],
    knownQuirks: ["Video workflows are more stateful than image workflows because model, node, codec, and frame-output state all matter."],
    researchStatus: "researched",
    evidence: [
      {
        date: reviewedAt,
        type: "docs-review",
        summary:
          "ComfyUI has local workflow primitives and video workflow documentation suitable for the first local generative-video research card.",
      },
    ],
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
    recommendationSummary:
      "Bundled Ambient CLI path for deterministic HTML/CSS/JS-to-video motion graphics rather than model-generated footage.",
    recommendationMemo: {
      deploymentRole: "fallback",
      recommendation:
        "Use the bundled ambient-hyperframes Ambient CLI package when the user wants deterministic designed video, animated charts, social overlays, UI demos, or HTML/CSS/JS-authored motion rather than generative footage.",
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
    firstPartyTemplate: {
      available: true,
      templateId: "ambient-cli:ambient-hyperframes",
      notes: "Use the bundled Ambient CLI package rather than Capability Builder scaffolding or the Scrapling MCP lane.",
    },
    ambientContract: {
      commandContract:
        "Ambient CLI package ambient-hyperframes exposes doctor, setup-plan, init, inspect, and render commands for declared HyperFrames sources.",
      descriptorRequirements: [
        "installerShape artifact-generator",
        "Ambient CLI package ambient-hyperframes",
        "source project path",
        "render command",
        "runtime dependency notes",
        "video artifact output",
      ],
      artifactPolicy: "Save source files, rendered media, first-frame preview, render logs, and media metadata.",
      validationTarget:
        "Render one tiny scene through ambient_cli hyperframes_render and verify video bytes, duration, dimensions, and first-frame preview.",
    },
    secrets: [],
    networkHosts: ["github.com", "npmjs.com"],
    modelAssets: [],
    localArtifactReadiness: {
      status: "conditional-local",
      verifiedArtifacts: [
        "Bundled Ambient CLI adapter",
        "Open-source repository",
        "Node.js >= 22 requirement",
        "render command",
        "approval-gated setup plan",
      ],
      missingOrBlockingArtifacts: ["Live Pi render dogfood", "Cross-platform real render validation"],
      minimumLocalSmokeTest:
        "Render a tiny scene with ambient_cli hyperframes_render, save MP4 plus first-frame preview, and verify metadata.",
    },
    runtimeState: { externalService: false, serviceKind: "none", statePaths: ["project source", "render output", "render logs"] },
    costPrivacyNotes: ["Local authored rendering avoids cloud upload unless scene assets reference remote media."],
    maintenanceNotes: ["Track Node.js version, CLI changes, and browser/render dependency requirements."],
    safetyBoundaries: ["Treat user-provided scene code as executable project code and apply workspace trust boundaries."],
    knownQuirks: ["Best positioned as authored-motion video; it should not be conflated with HyperFrames' SVG-animation card."],
    researchStatus: "researched",
    evidence: [
      {
        date: reviewedAt,
        type: "docs-review",
        summary: "HyperFrames exposes browser preview and local/Docker render paths for HTML/CSS/JS authored video.",
      },
    ],
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
      recommendation:
        "Use Luma Dream Machine API as a hosted video fallback when the user wants cloud text-to-video or image-to-video and accepts LUMA_API_KEY setup, provider policy, job polling, cost, and remote media handling.",
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
      commandContract:
        "Artifact generator submits a bounded Luma generation job, polls completion, downloads media outputs, and returns artifact/job metadata.",
      descriptorRequirements: [
        "installerShape artifact-generator",
        "secret env LUMA_API_KEY",
        "network host declaration",
        "job polling behavior",
        "video artifact output",
      ],
      artifactPolicy: "Download remote video outputs and first-frame previews into workspace artifacts.",
      validationTarget:
        "Run one low-cost hosted video job and verify job-state handling, media bytes, duration/dimensions, first-frame preview, and latency.",
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
    runtimeState: {
      externalService: true,
      serviceKind: "hosted-api",
      statePaths: ["generation/job id", "downloaded media artifact", "first-frame preview"],
      healthCheck: "API request or job status response.",
    },
    costPrivacyNotes: ["Prompts and source media leave the machine; usage may incur provider charges."],
    maintenanceNotes: ["Track API schema, model/settings availability, output URL lifetime, and policy/error semantics."],
    safetyBoundaries: ["Surface policy errors directly and avoid prompt rewriting to bypass provider rules."],
    knownQuirks: ["Hosted video APIs require polling and output download validation rather than immediate local artifacts."],
    researchStatus: "researched",
    evidence: [
      {
        date: reviewedAt,
        type: "docs-review",
        summary: "Luma positions Dream Machine as a REST API for text-to-video, image-to-video, and related generation workflows.",
      },
    ],
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
    recommendationSummary:
      "Primary hosted video-generation candidate for fast high-quality text/image-to-video dogfood with versioned API behavior.",
    recommendationMemo: {
      deploymentRole: "primary",
      recommendation:
        "Use Runway API as the first hosted video candidate when the user wants fast high-quality cloud video generation and accepts RUNWAYML_API_SECRET setup, cost, provider policy, and asynchronous job-state handling.",
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
    tradeoffs: [
      "Cloud/API cost",
      "Prompts/source images leave the machine",
      "Asynchronous tasks need polling, timeout, and download handling",
    ],
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
      commandContract:
        "Artifact generator submits a bounded Runway video task, polls completion, downloads media outputs, and returns artifact/task metadata.",
      descriptorRequirements: [
        "installerShape artifact-generator",
        "secret env RUNWAYML_API_SECRET",
        "network host declaration",
        "API version/model declaration",
        "video artifact output",
      ],
      artifactPolicy: "Download remote media outputs and first-frame previews into workspace artifacts.",
      validationTarget:
        "Run one low-cost hosted video task and verify task polling, media bytes, duration/dimensions, first-frame preview, API version, and latency.",
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
    runtimeState: {
      externalService: true,
      serviceKind: "hosted-api",
      statePaths: ["task/job id", "downloaded media artifact", "first-frame preview"],
      healthCheck: "API request or task status response.",
    },
    costPrivacyNotes: ["Prompts/source media leave the machine and generation may be expensive; show cost/privacy before install."],
    maintenanceNotes: ["Track X-Runway-Version, SDK/API changes, available models, and output URL lifetimes."],
    safetyBoundaries: ["Surface provider safety/policy errors directly and avoid prompt rewriting to bypass rules."],
    knownQuirks: ["Runway API behavior is versioned; wrappers should declare the API version they target."],
    researchStatus: "researched",
    evidence: [
      {
        date: reviewedAt,
        type: "docs-review",
        summary:
          "Runway setup docs expose SDK/API-key setup and versioned API behavior suitable for hosted video artifact-generator dogfood.",
      },
    ],
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
    recommendationSummary:
      "Reserved OpenAI video candidate because the current official Videos API/Sora 2 path is deprecated and scheduled for shutdown.",
    recommendationMemo: {
      deploymentRole: "reserved",
      recommendation:
        "Reserve OpenAI Sora Videos API for intentional existing-Sora experiments only. Do not make it a new default video provider because the official OpenAI docs mark the Videos API/Sora 2 path as deprecated and scheduled to shut down on September 24, 2026.",
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
      commandContract:
        "Reserved artifact generator would call the OpenAI Videos API only for explicitly approved experiments and must surface deprecation status.",
      descriptorRequirements: [
        "installerShape artifact-generator",
        "secret env OPENAI_API_KEY",
        "network host declaration",
        "deprecation warning",
        "video artifact output",
      ],
      artifactPolicy: "Download any remote media outputs into workspace artifacts and include deprecation metadata.",
      validationTarget:
        "Later phase only: verify official non-deprecated availability before any production wrapper; current path is reserved due to September 24, 2026 shutdown.",
    },
    secrets: [{ envName: "OPENAI_API_KEY", required: true, capture: "ambient_capability_builder_secret_request" }],
    networkHosts: ["api.openai.com"],
    modelAssets: [],
    localArtifactReadiness: {
      status: "hosted-reference",
      verifiedArtifacts: ["OpenAI video-generation guide", "Videos API reference", "deprecation/shutdown notice"],
      missingOrBlockingArtifacts: ["Non-deprecated OpenAI video provider path", "Credentialed Ambient wrapper smoke test"],
      minimumLocalSmokeTest:
        "Do not run as a default install; first verify a non-deprecated OpenAI video path or run an explicitly approved experiment before September 24, 2026.",
    },
    runtimeState: {
      externalService: true,
      serviceKind: "hosted-api",
      statePaths: ["request/task id", "downloaded media artifact", "deprecation metadata"],
      healthCheck: "API availability check only after explicit approval.",
    },
    costPrivacyNotes: ["Cloud-hosted provider; prompts/source media leave the machine and may incur API charges."],
    maintenanceNotes: ["Track OpenAI video docs for a replacement path after the deprecated Videos API/Sora 2 shutdown."],
    safetyBoundaries: ["Do not route users to a deprecated provider without explicit approval and current docs review."],
    knownQuirks: [
      "Official docs reviewed for this slice state the Videos API and Sora 2 are deprecated and shut down on September 24, 2026.",
    ],
    researchStatus: "deprecated",
    evidence: [
      {
        date: reviewedAt,
        type: "docs-review",
        summary: "Official OpenAI video docs mark the current Videos API/Sora 2 path deprecated with a September 24, 2026 shutdown date.",
      },
    ],
    docs: [
      { label: "OpenAI video generation guide", url: "https://platform.openai.com/docs/guides/video-generation", lastReviewed: reviewedAt },
      { label: "OpenAI Videos API reference", url: "https://platform.openai.com/docs/api-reference/videos", lastReviewed: reviewedAt },
    ],
  },
];
