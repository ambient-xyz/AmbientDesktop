import type { ProviderCatalogEntry } from "./providerCatalogTypes";

const reviewedAt = "2026-05-11";

export const providerCatalogWritingSvgEntries: ProviderCatalogEntry[] = [
  {
    id: "writing.tinystyler",
    displayName: "TinyStyler writing-style transfer",
    capabilityArea: "writing-style-transfer",
    installerShape: "custom-cli",
    providerKind: "local",
    sourceModel: "open-source",
    recommendationTier: "conditional",
    recommendationSummary:
      "Bundled Ambient CLI package for local few-shot writing-style profiles and style transfer from user-provided examples.",
    recommendationMemo: {
      deploymentRole: "primary",
      recommendation:
        "Use the bundled ambient-tinystyler Ambient CLI package when the user wants reusable writing-style profiles and local TinyStyler transfer from examples, while preserving raw-example privacy by default.",
      dogfoodTargets: [
        "Use ambient_cli_search and ambient_cli_describe to discover ambient-tinystyler through the standard Ambient CLI path.",
        "Run tinystyler_doctor, create one profile from tiny example text, transfer one short source text, and verify profile/output artifact paths plus transcript non-leakage.",
        "Exercise missing-model-cache behavior and confirm Pi surfaces dependency/model setup guidance rather than silently falling back to prompt-only rewriting.",
      ],
      promotionCriteria: [
        "ambient-tinystyler declares pinned TinyStyler, T5, and Style-Embedding revisions with model asset sizes, hashes, license notes, and pickle/remote-code decisions.",
        "Profile artifacts persist embeddings and aggregate counts by default, not raw example text or exact source verifiers.",
        "Live Ambient/Pi evidence proves search -> describe -> ambient_cli profile and transfer can run with bounded artifacts and no raw example leakage.",
      ],
      fallbackGuidance: [
        "Use ordinary chat rewriting when the user wants a one-off rewrite without reusable local profiles or model setup.",
        "Use Capability Builder only if the user asks for a different style-transfer package or a new provider contract.",
        "Keep optional reranking, interpolation strength, batch mode, and quality diagnostics deferred until their separate evidence gates pass.",
      ],
    },
    bestFor: [
      "Reusable writing-style profiles",
      "Local style transfer from example texts",
      "Workspace artifact output with bounded previews",
    ],
    tradeoffs: [
      "Real local transfer requires multi-GB model caches and Python ML dependencies",
      "Generated output can vary by model/runtime settings",
      "Deterministic fake mode is validation-only",
    ],
    avoidWhen: [
      "The user wants identity verification or impersonation",
      "The user needs a quick one-off rewrite without local model setup",
      "Raw example retention is not explicitly approved",
    ],
    platforms: ["macos-arm64", "macos-x64", "linux-x64", "windows-x64"],
    hardwareFit: [
      "CPU fallback is possible but slow; MPS/CUDA acceleration improves real transfer once local assets and dependencies are installed.",
    ],
    capabilityBuilderDefaults: {
      provider: "TinyStyler",
      locality: "local",
      outputFileArtifacts: ["json", "txt"],
      responseFormats: ["json", "text"],
      networkHosts: ["huggingface.co", "cdn-lfs.huggingface.co", "pypi.org", "files.pythonhosted.org"],
      modelAssets: ["tinystyler-transfer-weights", "t5-v1_1-large-backbone", "style-embedding-model-weights"],
    },
    firstPartyTemplate: {
      available: true,
      templateId: "ambient-cli:ambient-tinystyler",
      notes: "Use the bundled Ambient CLI package rather than scaffolding a new Capability Builder package for the baseline path.",
    },
    ambientContract: {
      commandContract:
        "Ambient CLI package ambient-tinystyler exposes tinystyler_doctor, tinystyler_profile, and tinystyler_transfer for declared local model assets or deterministic validation fixtures.",
      descriptorRequirements: [
        "Ambient CLI package ambient-tinystyler",
        "profile JSON schema",
        "declared Hugging Face model assets",
        "bounded stdout",
        "workspace output artifacts",
        "raw-example retention opt-in",
      ],
      artifactPolicy:
        "Profile JSON and transfer TXT artifacts must be workspace-visible; raw examples and exact source verifiers are not persisted unless explicitly requested.",
      validationTarget:
        "Install bundled:ambient-tinystyler, run doctor, create one profile, transfer one short text, and verify artifact paths plus no raw example leakage.",
    },
    secrets: [],
    networkHosts: ["huggingface.co", "cdn-lfs.huggingface.co", "pypi.org", "files.pythonhosted.org"],
    modelAssets: [
      {
        name: "tinystyler-transfer-weights",
        sourceUrl: "https://huggingface.co/tinystyler/tinystyler",
        expectedSize: "3.14 GB",
        licenseNote: "MIT model card; PyTorch pickle weights load only from the reviewed declared cache path.",
        cachePolicy: "Pinned revision and SHA-256 in ambient-tinystyler descriptor.",
      },
      {
        name: "t5-v1_1-large-backbone",
        sourceUrl: "https://huggingface.co/google/t5-v1_1-large",
        expectedSize: "3.13 GB",
        licenseNote: "Apache-2.0 upstream model terms.",
        cachePolicy: "Pinned revision and SHA-256 in ambient-tinystyler descriptor.",
      },
      {
        name: "style-embedding-model-weights",
        sourceUrl: "https://huggingface.co/AnnaWegmann/Style-Embedding",
        expectedSize: "499 MB",
        licenseNote: "Hugging Face model asset for style embeddings.",
        cachePolicy: "Pinned revision and SHA-256 in ambient-tinystyler descriptor.",
      },
    ],
    localArtifactReadiness: {
      status: "conditional-local",
      verifiedArtifacts: [
        "Bundled Ambient CLI adapter",
        "profile schema",
        "deterministic fake/fixture smoke path",
        "live Ambient/Pi CLI dogfood evidence",
      ],
      missingOrBlockingArtifacts: [
        "Approved real-model dependency install on each host class",
        "Warm real TinyStyler transfer cache",
        "non-fake quality evidence",
      ],
      minimumLocalSmokeTest:
        "Run ambient_cli tinystyler_profile and tinystyler_transfer on tiny workspace files and verify profile/output artifacts plus transcript non-leakage.",
    },
    runtimeState: {
      externalService: false,
      serviceKind: "none",
      statePaths: [".ambient/cli-packages/imported/ambient-tinystyler-*", ".ambient/tinystyler/profiles", ".ambient/tinystyler/outputs"],
    },
    costPrivacyNotes: [
      "Local execution avoids API keys and cloud text upload after model assets are installed; model downloads still contact Hugging Face/PyPI hosts.",
      "Raw example text is not persisted by default.",
    ],
    maintenanceNotes: [
      "Track TinyStyler, T5, and Style-Embedding revisions, model hashes, Python ML dependency compatibility, and optional reranking deferrals.",
    ],
    safetyBoundaries: [
      "Treat this as style adaptation, not identity verification or impersonation.",
      "Do not persist raw examples or exact source verifiers without explicit user opt-in.",
      "Do not silently repair failed model output through prompt-only rewriting.",
    ],
    knownQuirks: [
      "The baseline package includes deterministic fake/fixture validation paths; those are not user-facing TinyStyler generation.",
      "Real transfer is model-cache and accelerator sensitive.",
    ],
    researchStatus: "live-dogfooded",
    evidence: [
      {
        date: "2026-06-17",
        type: "local-smoke",
        summary:
          "Bundled ambient-tinystyler deterministic package smoke passed for doctor, profile, transfer, schema, and workspace-boundary behavior.",
      },
      {
        date: "2026-06-17",
        type: "pi-live-dogfood",
        summary:
          "Live Ambient/Pi dogfood created a profile and transferred a short text through search -> describe -> ambient_cli using Ambient Kimi, with raw example leakage checks.",
      },
      {
        date: "2026-06-16",
        type: "docs-review",
        summary:
          "TinyStyler paper, upstream repository, Hugging Face model card/files, and Style-Embedding model card reviewed for pinned asset/package decisions.",
      },
    ],
    docs: [
      { label: "TinyStyler paper", url: "https://arxiv.org/abs/2406.15586", lastReviewed: "2026-06-16" },
      { label: "TinyStyler Hugging Face model", url: "https://huggingface.co/tinystyler/tinystyler", lastReviewed: "2026-06-16" },
      { label: "TinyStyler repository", url: "https://github.com/zacharyhorvitz/TinyStyler", lastReviewed: "2026-06-16" },
      { label: "Style-Embedding model", url: "https://huggingface.co/AnnaWegmann/Style-Embedding", lastReviewed: "2026-06-16" },
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
      recommendation:
        "Use code-native SVG/CSS/SMIL as the primary SVG-animation path when the requested output is a standalone, inspectable `.svg` or small HTML preview rather than app animation JSON or rendered video.",
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
    tradeoffs: [
      "Complex motion can become hard to maintain",
      "SMIL/CSS behavior must be checked in target browsers",
      "Not ideal for app animation systems that expect Lottie",
    ],
    avoidWhen: [
      "The deliverable must be MP4/GIF/video",
      "The target product expects Lottie/dotLottie JSON",
      "The animation needs timeline editing or audio",
    ],
    platforms: ["any"],
    hardwareFit: ["No special hardware for authoring or previewing tiny SVGs"],
    firstPartyTemplate: {
      available: true,
      templateId: "svg-animation:code-native-svg-css-smil",
      notes: "Use direct artifact generation and browser preview before heavier animation frameworks.",
    },
    capabilityBuilderDefaults: {
      provider: "Code-native SVG/CSS/SMIL",
      locality: "local",
      outputFileArtifacts: ["svg", "html", "png"],
      responseFormats: ["text", "json"],
    },
    ambientContract: {
      commandContract: "Artifact generator writes a standalone SVG or HTML preview plus optional screenshot/frame proof.",
      descriptorRequirements: [
        "artifact-generator shape",
        "declared SVG/HTML outputs",
        "browser preview or structural validation proof",
        "accessibility/title notes",
      ],
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
    runtimeState: {
      externalService: false,
      serviceKind: "none",
      statePaths: ["workspace SVG/HTML artifacts", "optional preview screenshot"],
    },
    costPrivacyNotes: ["Local deterministic text artifacts; no cloud upload required."],
    maintenanceNotes: [
      "Track target browser compatibility, SVG sanitization expectations, accessibility labels, and screenshot/frame validation coverage.",
    ],
    safetyBoundaries: ["Avoid inline script unless explicitly required; keep generated SVG self-contained and inspectable."],
    knownQuirks: ["SVG animation support differs by host context; some image surfaces render only the static first frame."],
    researchStatus: "researched",
    evidence: [
      {
        date: reviewedAt,
        type: "docs-review",
        summary: "MDN SVG/SMIL animation docs reviewed for animate, animateTransform, and animateMotion support.",
      },
    ],
    docs: [
      {
        label: "MDN SVG animation with SMIL",
        url: "https://developer.mozilla.org/en-US/docs/Web/SVG/Guides/SVG_animation_with_SMIL",
        lastReviewed: reviewedAt,
      },
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
    recommendationSummary:
      "App-friendly vector animation format for product UI embeds when the target player expects Lottie JSON or `.lottie` bundles.",
    recommendationMemo: {
      deploymentRole: "fallback",
      recommendation:
        "Use Lottie or dotLottie when the target product, mobile app, or web component expects a compact animation JSON/container with player support; do not choose it for arbitrary standalone SVGs unless the app runtime is the real target.",
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
    tradeoffs: [
      "Player/runtime support matters",
      "Not every After Effects/bodymovin feature behaves identically in every player",
      "More opaque than a tiny handwritten SVG",
    ],
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
      descriptorRequirements: [
        "artifact-generator shape",
        "Lottie/dotLottie format declaration",
        "player/version notes",
        "duration/dimensions metadata",
      ],
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
      minimumLocalSmokeTest:
        "Generate one tiny Lottie JSON, load it in a local preview player, and capture a first-frame screenshot or structural validation report.",
    },
    runtimeState: { externalService: false, serviceKind: "none", statePaths: ["workspace animation artifacts", "optional preview HTML"] },
    costPrivacyNotes: ["Local artifacts avoid cloud upload unless LottieFiles hosting or cloud editors are intentionally used."],
    maintenanceNotes: [
      "Track player versions, supported features, asset embedding, compression/container format, and target-platform compatibility.",
    ],
    safetyBoundaries: ["Do not fetch or embed third-party hosted animations without provenance and license review."],
    knownQuirks: [
      "Lottie JSON is a single-animation file; dotLottie is better for compressed bundles, themes, state machines, or multi-animation packaging.",
    ],
    researchStatus: "researched",
    evidence: [
      {
        date: reviewedAt,
        type: "docs-review",
        summary: "LottieFiles format docs reviewed for Lottie JSON capabilities and dotLottie limitations/benefits.",
      },
    ],
    docs: [
      { label: "Lottie JSON format", url: "https://docs.lottiefiles.com/en/format/lottie-json", lastReviewed: reviewedAt },
      { label: "dotLottie format", url: "https://docs.lottiefiles.com/en/format/dotlottie", lastReviewed: reviewedAt },
      {
        label: "dotLottie web usage",
        url: "https://developers.lottiefiles.com/docs/dotlottie-player/dotlottie-web/usage/",
        lastReviewed: reviewedAt,
      },
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
    recommendationSummary:
      "Bundled Ambient CLI path for HTML/CSS/JS authored-motion rendering, including animated SVG/CSS patterns exported to video.",
    recommendationMemo: {
      deploymentRole: "fallback",
      recommendation:
        "Use HyperFrames when the user wants authored motion from HTML/CSS/JS, animated SVG/CSS patterns, social overlays, data videos, or explainable motion graphics that should render to MP4/WebM/MOV or PNG frames.",
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
    bestFor: [
      "HTML-authored motion graphics",
      "Animated charts and overlays",
      "Deterministic MP4/WebM/MOV rendering",
      "Agent-friendly video from HTML/CSS/JS",
    ],
    tradeoffs: [
      "Requires Node.js and FFmpeg",
      "Rendered video is heavier than SVG/Lottie",
      "Newer project surface needs Ambient dogfood before default recommendation",
    ],
    avoidWhen: [
      "The deliverable must be a lightweight standalone SVG",
      "The target app already requires Lottie JSON",
      "The user cannot install Node/FFmpeg or run browser rendering",
    ],
    platforms: ["macos-arm64", "macos-x64", "linux-x64"],
    hardwareFit: ["CPU works for tiny renders; GPU/browser flags and FFmpeg settings matter for longer or richer compositions"],
    capabilityBuilderDefaults: {
      provider: "HyperFrames by HeyGen",
      locality: "local",
      outputFileArtifacts: ["mp4", "webm", "mov", "png", "html"],
      responseFormats: ["json", "text"],
      modelAssets: ["Node.js >= 22", "FFmpeg"],
    },
    firstPartyTemplate: {
      available: true,
      templateId: "ambient-cli:ambient-hyperframes",
      notes: "Use the bundled Ambient CLI adapter for doctor/init/inspect/render before considering custom scaffolding.",
    },
    ambientContract: {
      commandContract:
        "Ambient CLI package ambient-hyperframes previews or renders one bounded HyperFrames composition and returns output media paths plus render metadata.",
      descriptorRequirements: [
        "custom-cli shape",
        "Ambient CLI package ambient-hyperframes",
        "Node/FFmpeg dependency declaration",
        "output format declaration",
        "preview/render artifact metadata",
      ],
      artifactPolicy: "Persist composition source, render logs, output media, and first-frame proof by workspace path.",
      validationTarget:
        "Render a 1-3 second animated composition through ambient_cli hyperframes_render and verify the media/frame artifact exists and is non-empty.",
    },
    secrets: [],
    networkHosts: [],
    modelAssets: [
      {
        name: "HyperFrames CLI/runtime",
        sourceUrl: "https://github.com/heygen-com/hyperframes",
        licenseNote: "Apache-2.0",
        cachePolicy: "Project-local npm dependencies.",
      },
      { name: "FFmpeg", sourceUrl: "https://ffmpeg.org/", cachePolicy: "System install or managed binary path." },
    ],
    localArtifactReadiness: {
      status: "conditional-local",
      verifiedArtifacts: [
        "Bundled Ambient CLI adapter",
        "GitHub repo",
        "CLI docs",
        "render docs",
        "Apache-2.0 license",
        "Node.js >= 22 and FFmpeg requirements",
      ],
      missingOrBlockingArtifacts: ["Live Pi render dogfood", "cross-platform install dogfood", "media validation helper for output codecs"],
      minimumLocalSmokeTest:
        "Run ambient_cli hyperframes_render on a tiny composition and verify MP4 or PNG sequence output plus first-frame screenshot.",
    },
    runtimeState: {
      externalService: true,
      serviceKind: "local-daemon",
      statePaths: ["composition directory", "render output", "preview server logs"],
      healthCheck: "Run `npx hyperframes preview` for local preview or `npx hyperframes render` for non-interactive validation.",
    },
    costPrivacyNotes: [
      "Rendering is local; optional website capture or AI-description features may call external services only if explicitly enabled.",
    ],
    maintenanceNotes: [
      "Track HyperFrames CLI version, Node version, FFmpeg availability, Chrome/browser flags, Docker mode, codecs, and output format support.",
    ],
    safetyBoundaries: [
      "Do not run website capture or external asset downloads without user approval; keep render sources and assets explicit.",
    ],
    knownQuirks: [
      "Preview uses real-time browser playback, while render captures frames one at a time, so preview performance can differ from final output speed.",
    ],
    researchStatus: "researched",
    evidence: [
      {
        date: reviewedAt,
        type: "docs-review",
        summary: "HyperFrames GitHub, CLI, and rendering docs reviewed; artifacts are enough for a conditional local render smoke test.",
      },
    ],
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
    recommendationSummary:
      "React/TSX video-rendering stack for authored motion when the output should be video and the team accepts Remotion's runtime and licensing constraints.",
    recommendationMemo: {
      deploymentRole: "fallback",
      recommendation:
        "Use Remotion when the project already wants React/TSX motion components, programmatic video rendering, or production render infrastructure; keep it secondary to simpler SVG/Lottie paths for small vector assets.",
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
    tradeoffs: [
      "Heavier setup than SVG or Lottie",
      "License/commercial terms need review",
      "Requires browser/FFmpeg rendering infrastructure",
    ],
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
      descriptorRequirements: [
        "custom-cli shape",
        "composition metadata",
        "codec/output declaration",
        "license/runtime notes",
        "render proof",
      ],
      artifactPolicy: "Persist composition source, render logs, output media, and first-frame proof by workspace path.",
      validationTarget: "Render a tiny React/TSX composition to MP4 and verify media metadata plus first frame.",
    },
    secrets: [],
    networkHosts: [],
    modelAssets: [
      {
        name: "Remotion packages",
        sourceUrl: "https://www.remotion.dev/docs/",
        licenseNote: "Review Remotion licensing/commercial terms before promotion.",
        cachePolicy: "Project-local npm dependencies.",
      },
    ],
    localArtifactReadiness: {
      status: "conditional-local",
      verifiedArtifacts: ["Remotion project setup docs", "renderMedia renderer docs", "agent-skills guidance"],
      missingOrBlockingArtifacts: [
        "Ambient-owned tiny render fixture",
        "license/commercial-use approval",
        "cross-platform render dependency validation",
      ],
      minimumLocalSmokeTest: "Create a tiny Remotion composition and render MP4 with first-frame validation.",
    },
    runtimeState: {
      externalService: false,
      serviceKind: "none",
      statePaths: ["Remotion project directory", "render output", "package cache"],
    },
    costPrivacyNotes: ["Local rendering avoids cloud upload; hosted/Lambda render paths have separate cost and privacy implications."],
    maintenanceNotes: [
      "Track Remotion package version, Node/browser/FFmpeg requirements, codec support, and license/commercial-use constraints.",
    ],
    safetyBoundaries: ["Do not use remote render infrastructure or download external assets without explicit user approval."],
    knownQuirks: ["Remotion is excellent for React video systems, but it is too heavy for many simple SVG/Lottie requests."],
    researchStatus: "researched",
    evidence: [
      {
        date: reviewedAt,
        type: "docs-review",
        summary: "Remotion project setup and renderMedia docs reviewed as a conditional rendered-motion fallback.",
      },
    ],
    docs: [
      { label: "Remotion getting started", url: "https://www.remotion.dev/docs/", lastReviewed: reviewedAt },
      { label: "Remotion renderMedia", url: "https://www.remotion.dev/docs/renderer/render-media", lastReviewed: reviewedAt },
    ],
  },
];
