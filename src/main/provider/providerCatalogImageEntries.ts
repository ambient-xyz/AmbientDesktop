import type { ProviderCatalogEntry } from "./providerCatalogTypes";

const reviewedAt = "2026-05-11";

export const providerCatalogImageEntries: ProviderCatalogEntry[] = [
  {
    id: "image.hosted-api-skill-wrapper",
    displayName: "Ambient hosted image API wrapper",
    capabilityArea: "image-generation",
    installerShape: "artifact-generator",
    providerKind: "cloud",
    sourceModel: "mixed",
    recommendationTier: "conditional",
    recommendationSummary:
      "Thin bundled Ambient CLI package for hosted image APIs including OpenAI, Google Nano Banana Pro, fal/FLUX, Replicate, Stability AI, and Ideogram.",
    recommendationMemo: {
      deploymentRole: "primary",
      recommendation:
        "Use the bundled ambient-imagegen package as the default hosted image API path: it keeps provider-specific logic as small adapters, uses Ambient-managed secret bindings, and writes durable workspace image artifacts plus metadata.",
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
    bestFor: [
      "Default hosted image skill",
      "Google Nano Banana Pro",
      "OpenAI GPT Image",
      "fal and FLUX",
      "Replicate",
      "Stability AI",
      "Ideogram",
    ],
    tradeoffs: [
      "Cloud/API cost",
      "Provider prompts leave the machine",
      "Advanced provider-specific editing features may need a later adapter extension",
    ],
    avoidWhen: [
      "The user requires local/offline generation",
      "The requested output should be vector/document-native",
      "The task needs ComfyUI workflow/model control",
    ],
    platforms: ["any"],
    hardwareFit: ["No local acceleration required."],
    firstPartyTemplate: {
      available: true,
      templateId: "ambient-cli:ambient-imagegen",
      notes:
        "Bundled Ambient CLI package with provider aliases openai, google, google-nano-banana-pro, fal, flux, replicate, stability, and ideogram.",
    },
    capabilityBuilderDefaults: {
      provider: "Ambient hosted image API wrapper",
      locality: "network",
      outputFileArtifacts: ["png", "webp", "jpg"],
      responseFormats: ["json"],
      envNames: [
        "OPENAI_API_KEY",
        "GEMINI_API_KEY",
        "GOOGLE_API_KEY",
        "FAL_KEY",
        "REPLICATE_API_TOKEN",
        "STABILITY_API_KEY",
        "IDEOGRAM_API_KEY",
      ],
      networkHosts: [
        "api.openai.com",
        "generativelanguage.googleapis.com",
        "fal.run",
        "api.replicate.com",
        "api.stability.ai",
        "api.ideogram.ai",
      ],
    },
    ambientContract: {
      commandContract:
        "Ambient CLI command hosted_image_generate selects a provider alias, calls the hosted API, stores image bytes in the workspace, and returns bounded artifact metadata.",
      descriptorRequirements: [
        "installerShape artifact-generator",
        "ambient-imagegen bundled package",
        "provider alias",
        "Ambient-managed secret env binding",
        "image artifact output",
      ],
      artifactPolicy:
        "Write generated image artifacts plus sibling metadata JSON to user-visible workspace paths; never leave only temporary remote URLs.",
      validationTarget:
        "Run hosted_image_generate with AMBIENT_HOSTED_IMAGE_FAKE_GENERATION=1 for deterministic local artifact validation, then run one low-cost credentialed provider smoke when a provider secret is available.",
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
    networkHosts: [
      "api.openai.com",
      "generativelanguage.googleapis.com",
      "fal.run",
      "fal.ai",
      "queue.fal.run",
      "api.replicate.com",
      "replicate.delivery",
      "api.stability.ai",
      "api.ideogram.ai",
      "ideogram.ai",
    ],
    modelAssets: [],
    localArtifactReadiness: {
      status: "hosted-reference",
      verifiedArtifacts: ["Bundled Ambient CLI package", "provider alias table", "fake image artifact path", "metadata JSON contract"],
      missingOrBlockingArtifacts: ["Credentialed smoke evidence for every provider adapter"],
      minimumLocalSmokeTest:
        "Install ambient-imagegen and run hosted_image_generate with AMBIENT_HOSTED_IMAGE_FAKE_GENERATION=1 to verify image bytes, MIME type, dimensions, SHA-256, and metadata.",
    },
    runtimeState: {
      externalService: true,
      serviceKind: "hosted-api",
      statePaths: ["downloaded or decoded image artifact", "sibling metadata JSON"],
      healthCheck: "hosted_image_doctor --json",
    },
    costPrivacyNotes: [
      "Prompts and generated content are sent to the selected hosted provider; usage may incur provider-specific charges.",
    ],
    maintenanceNotes: ["Keep provider aliases, default models, endpoint shapes, and response extraction current as hosted APIs change."],
    safetyBoundaries: [
      "Use Ambient-managed secret binding; never ask users to paste API keys into chat.",
      "Surface provider policy errors directly; do not rewrite prompts to bypass policy.",
    ],
    knownQuirks: [
      "The wrapper intentionally covers the common text-to-image artifact path first; provider-specific edit/batch modes may need later adapter flags.",
    ],
    researchStatus: "researched",
    evidence: [
      {
        date: reviewedAt,
        type: "docs-review",
        summary:
          "OpenAI, Google Nano Banana, fal, Replicate, Stability AI, and Ideogram hosted image API docs reviewed for a shared thin artifact-generator wrapper shape.",
      },
      {
        date: reviewedAt,
        type: "local-smoke",
        summary:
          "Bundled ambient-imagegen package includes a deterministic fake generation path for no-secret install/search/describe/artifact validation.",
      },
    ],
    docs: [
      { label: "Ambient hosted image package", url: "resources/ambient-cli-packages/ambient-imagegen", lastReviewed: reviewedAt },
      { label: "Google Gemini image generation", url: "https://ai.google.dev/gemini-api/docs/image-generation", lastReviewed: reviewedAt },
      { label: "OpenAI image generation guide", url: "https://platform.openai.com/docs/guides/image-generation", lastReviewed: reviewedAt },
      {
        label: "fal image generation tutorial",
        url: "https://fal.ai/docs/examples/image-generation/generate-images-from-text",
        lastReviewed: reviewedAt,
      },
      {
        label: "Replicate predictions guide",
        url: "https://replicate.com/docs/topics/predictions/create-a-prediction",
        lastReviewed: reviewedAt,
      },
      { label: "Stability AI API reference", url: "https://platform.stability.ai/docs/api-reference", lastReviewed: reviewedAt },
      {
        label: "Ideogram generate API",
        url: "https://developer.ideogram.ai/api-reference/api-reference/generate-v4",
        lastReviewed: reviewedAt,
      },
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
    recommendationSummary:
      "Primary local/open image-generation workflow path once model assets, GPU/Metal fit, and workflow state are explicit.",
    recommendationMemo: {
      deploymentRole: "fallback",
      recommendation:
        "Use ComfyUI local image workflows when the user wants local model control, privacy, or Stable Diffusion/FLUX-style workflow composition and accepts explicit model downloads, GPU/Metal fit checks, and workflow/runtime state management.",
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
    tradeoffs: [
      "Model downloads and disk use can be large",
      "Workflow/model compatibility is fragile",
      "GPU/Metal fit determines practical latency",
    ],
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
      commandContract:
        "Artifact generator wraps a bounded ComfyUI workflow run and returns output image metadata plus paths to full logs/workflow state.",
      descriptorRequirements: [
        "installerShape artifact-generator",
        "model asset declarations",
        "workflow JSON path",
        "local daemon lifecycle notes",
        "image artifact output",
      ],
      artifactPolicy: "Write generated image artifacts plus workflow/log metadata to user-visible workspace paths.",
      validationTarget:
        "Start or connect to ComfyUI, run one tiny workflow, and verify image bytes, MIME type, dimensions, and model/workflow metadata.",
    },
    secrets: [],
    networkHosts: ["github.com", "huggingface.co", "civitai.com"],
    modelAssets: [
      {
        name: "ComfyUI workflow model assets",
        licenseNote: "Review each selected model/checkpoint license.",
        cachePolicy: "Provider model cache; state must be declared before install.",
      },
    ],
    localArtifactReadiness: {
      status: "conditional-local",
      verifiedArtifacts: ["ComfyUI runtime", "workflow JSON support", "local model cache pattern", "image output artifacts"],
      missingOrBlockingArtifacts: ["Selected workflow/model bundle", "Validated Ambient wrapper lifecycle"],
      minimumLocalSmokeTest: "Run a low-step 512x512 image workflow and verify output bytes, MIME type, dimensions, model paths, and logs.",
    },
    runtimeState: {
      externalService: true,
      serviceKind: "local-daemon",
      statePaths: ["ComfyUI model cache", "workflow JSON", "output directory", "daemon logs"],
      healthCheck: "HTTP API or process liveness check before queueing a workflow.",
    },
    costPrivacyNotes: ["No cloud upload after models are installed; download sources and model licenses still need review."],
    maintenanceNotes: [
      "Pin workflow JSON, custom nodes, model revisions, and ComfyUI version; local workflows can break after runtime or node updates.",
    ],
    safetyBoundaries: ["Do not auto-download unreviewed model assets or custom nodes without explicit user approval."],
    knownQuirks: ["State spans daemon lifecycle, custom nodes, model files, workflow JSON, and output directories."],
    researchStatus: "researched",
    evidence: [
      {
        date: reviewedAt,
        type: "docs-review",
        summary:
          "ComfyUI has official runtime/docs and workflow-oriented image generation primitives suitable for local artifact-generator wrapping.",
      },
    ],
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
    recommendationSummary:
      "Hosted model API marketplace for image generation when provider breadth matters more than first-party defaulting.",
    recommendationMemo: {
      deploymentRole: "fallback",
      recommendation:
        "Use fal Model APIs as a hosted image-generation fallback when the user wants access to many image models through one API and accepts cloud cost, queue/job state, model-specific terms, and a FAL_KEY secret.",
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
    tradeoffs: [
      "Cloud cost and provider/model-specific terms",
      "Queue/job behavior varies by model",
      "Output quality depends on selected model",
    ],
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
      commandContract:
        "Artifact generator submits a bounded fal image job/request, downloads the output, and returns artifact metadata plus provider job metadata.",
      descriptorRequirements: [
        "installerShape artifact-generator",
        "secret env FAL_KEY",
        "network host declaration",
        "model id/version declaration",
        "image artifact output",
      ],
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
    runtimeState: {
      externalService: true,
      serviceKind: "hosted-api",
      statePaths: ["provider job id", "downloaded output artifact"],
      healthCheck: "API request or queue status response.",
    },
    costPrivacyNotes: [
      "Prompts and generated content leave the machine; model/provider-specific costs and terms must be shown before install.",
    ],
    maintenanceNotes: ["Refresh pinned model ids and parameters as fal model endpoints change."],
    safetyBoundaries: ["Respect model/provider content policies and avoid exposing remote output URLs that may include sensitive tokens."],
    knownQuirks: ["Different fal models expose different schemas, queue behavior, and output URL shapes."],
    researchStatus: "researched",
    evidence: [
      {
        date: reviewedAt,
        type: "docs-review",
        summary: "fal Model APIs expose client and queue-style hosted inference patterns suitable for cloud artifact-generator wrappers.",
      },
    ],
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
    recommendationSummary:
      "Primary hosted image-generation and editing candidate when users accept OpenAI API cost, network, and privacy tradeoffs.",
    recommendationMemo: {
      deploymentRole: "primary",
      recommendation:
        "Use OpenAI GPT Image API as the primary hosted image path when the user wants high-quality image generation or editing quickly and accepts Ambient-managed OPENAI_API_KEY setup, cloud execution, provider policy, and per-request cost.",
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
      commandContract:
        "Artifact generator calls the OpenAI Images API, stores the returned image as a workspace artifact, and returns metadata instead of raw large payloads.",
      descriptorRequirements: [
        "installerShape artifact-generator",
        "secret env OPENAI_API_KEY",
        "network host declaration",
        "image artifact output",
        "model id declaration",
      ],
      artifactPolicy: "Write generated or edited image artifacts to user-visible paths; keep only bounded previews in Pi context.",
      validationTarget:
        "Generate one tiny image through the OpenAI Images API and verify bytes, MIME type, dimensions, model id, and latency.",
    },
    secrets: [{ envName: "OPENAI_API_KEY", required: true, capture: "ambient_capability_builder_secret_request" }],
    networkHosts: ["api.openai.com"],
    modelAssets: [],
    localArtifactReadiness: {
      status: "hosted-reference",
      verifiedArtifacts: ["OpenAI image-generation guide", "Images API reference", "gpt-image-2 model guidance"],
      missingOrBlockingArtifacts: ["Credentialed Ambient wrapper smoke test", "Edit-path validation"],
      minimumLocalSmokeTest:
        "With OPENAI_API_KEY, run one low-cost `gpt-image-2` image generation and validate the downloaded or decoded artifact.",
    },
    runtimeState: {
      externalService: true,
      serviceKind: "hosted-api",
      statePaths: ["request metadata", "downloaded or decoded image artifact"],
      healthCheck: "API request response.",
    },
    costPrivacyNotes: ["Cloud-hosted provider; prompts/source images leave the machine and usage may incur API charges."],
    maintenanceNotes: ["Track OpenAI image model/version guidance and output response format changes."],
    safetyBoundaries: ["Surface provider safety/policy errors directly; do not rewrite prompts to bypass policy."],
    knownQuirks: ["Output may arrive as encoded image data or downloadable content depending on API shape and wrapper choices."],
    researchStatus: "researched",
    evidence: [
      {
        date: reviewedAt,
        type: "docs-review",
        summary:
          "OpenAI image-generation docs list GPT Image as the current image-generation/editing API path and `gpt-image-2` as the latest recommended image model.",
      },
    ],
    docs: [
      { label: "OpenAI image generation guide", url: "https://platform.openai.com/docs/guides/image-generation", lastReviewed: reviewedAt },
      { label: "OpenAI Images API reference", url: "https://platform.openai.com/docs/api-reference/images", lastReviewed: reviewedAt },
    ],
  },
];
