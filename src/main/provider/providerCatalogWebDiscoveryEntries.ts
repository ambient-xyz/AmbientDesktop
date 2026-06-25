import type { ProviderCatalogEntry } from "./providerCatalogTypes";

const reviewedAt = "2026-05-11";

export const providerCatalogWebDiscoveryEntries: ProviderCatalogEntry[] = [
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
      recommendation:
        "Use Brave Search as the first API-backed web search provider for Ambient because it has a direct JSON API, an existing first-party template, a narrow secret shape, and prior live Capability Builder dogfood.",
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
      {
        date: reviewedAt,
        type: "pi-live-dogfood",
        summary:
          "Existing Capability Builder live dogfood installs, binds secrets, registers, and runs real Brave Search API queries through Ambient CLI.",
      },
      {
        date: reviewedAt,
        type: "credentialed-smoke",
        summary:
          "Phase 5 live Pi dogfood reran Brave Search with BRAVE_API_KEY from an approved ignored secret file, installed the package, bound the file secret, requested the Desktop secret flow, saved the secret, ran two real searches, and verified the key was absent from transcript and audit output.",
      },
    ],
    docs: [
      {
        label: "Brave Search API",
        url: "https://api-dashboard.search.brave.com/app/documentation/web-search/get-started",
        lastReviewed: reviewedAt,
      },
    ],
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
      reason:
        "Google Search (browser) uses existing approved browser/web research tooling and must not be scaffolded, registered, or claimed as an installed provider.",
      actionLabel: "Review",
      actionTitle: "Review browser-mediated Google Search guidance.",
    },
    recommendationMemo: {
      deploymentRole: "fallback",
      recommendation:
        "Use browser-mediated Google Search only as a visible, user-intent-driven fallback when API-backed search coverage is insufficient or the user specifically asks for Google results.",
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
      commandContract:
        "Use browser-mediated search tools with visible navigation and bounded extraction rather than a generated search-provider package.",
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
    safetyBoundaries: [
      "Do not scrape Google HTML as an installed provider path unless the user explicitly approves browser-mediated search.",
    ],
    knownQuirks: ["May hit consent pages, CAPTCHAs, personalization, or regional result differences."],
    researchStatus: "researched",
    evidence: [
      { date: reviewedAt, type: "manual-note", summary: "Seeded as the straight Google Search fallback requested for the catalog." },
    ],
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
      recommendation:
        "Do not make Google Programmable Search the default new-user path: Google's Custom Search JSON API is closed to new customers and existing customers must transition by January 1, 2027. Keep it as a reserved path for users who already have valid API access and a search engine id.",
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
    tradeoffs: [
      "Requires API key and search engine id",
      "Quota and Custom Search configuration complexity",
      "Closed to new customers with existing-customer transition deadline",
    ],
    avoidWhen: [
      "The user expects unrestricted consumer Google Search behavior",
      "The user does not already have Custom Search JSON API access",
    ],
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
    costPrivacyNotes: [
      "Queries go to Google API and may use paid quota; the API is only available to existing customers until discontinuation.",
    ],
    maintenanceNotes: [
      "Document Custom Search engine setup separately from API key setup, and track the January 1, 2027 transition deadline.",
    ],
    safetyBoundaries: ["Do not scrape Google HTML when an API path was configured unless the user explicitly asks."],
    knownQuirks: [
      "Coverage depends on Programmable Search configuration.",
      "Google docs state the Custom Search JSON API is closed to new customers and existing customers must transition by January 1, 2027.",
    ],
    researchStatus: "researched",
    evidence: [
      { date: reviewedAt, type: "docs-review", summary: "Google Custom Search JSON API reviewed as direct Google search option." },
    ],
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
      recommendation:
        "Use SearXNG as the self-hosted/metasearch path only when the user accepts a managed Docker/Podman service, persistent config/state, health checks, and regular updates for upstream-engine breakage.",
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
    recommendationSummary:
      "Recommended first local scraping/extraction library path for static HTML and structured extraction before heavier browser automation.",
    recommendationMemo: {
      deploymentRole: "primary",
      recommendation:
        "Use Scrapling as the first recommended generated scraping capability when the target is public/static or can be fetched within approved boundaries; keep authenticated or highly dynamic browsing on Ambient browser tools.",
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
    bestFor: [
      "Structured extraction experiments",
      "Local scraping wrappers",
      "Static HTML extraction with real package dogfood",
      "Anti-bot-aware extraction research",
    ],
    tradeoffs: [
      "Needs careful anti-abuse guidance",
      "May require browser dependencies",
      "Dynamic browser-backed modes need separate validation from static extraction",
    ],
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
      descriptorRequirements: [
        "browser-tooling or custom-cli installer shape",
        "bounded response preview",
        "full output artifact path for large content",
      ],
      artifactPolicy: "Write large extracted content to workspace artifacts and return previews to Pi.",
      validationTarget: "Extract from a controlled fixture and one public page.",
    },
    secrets: [],
    networkHosts: [],
    modelAssets: [],
    runtimeState: { externalService: false, serviceKind: "none" },
    costPrivacyNotes: ["Network requests go directly from the user's machine."],
    maintenanceNotes: [
      "Pin dependency versions, document browser/runtime requirements, and re-run the real-package dogfood when Scrapling releases change selector behavior.",
    ],
    safetyBoundaries: ["Obey user intent, authentication boundaries, site terms, robots where applicable, and rate limits."],
    knownQuirks: [
      "Dynamic sites may still require full browser automation.",
      "Recent releases changed selector return shapes, so wrapper tests should assert exact JSON output.",
    ],
    researchStatus: "live-dogfooded",
    evidence: [
      { date: reviewedAt, type: "docs-review", summary: "GitHub project reviewed as requested scraping candidate." },
      {
        date: reviewedAt,
        type: "pi-live-dogfood",
        summary:
          "Existing live Capability Builder dogfood installs/warm-runs real Scrapling dependencies, validates/registers/uses static extraction, unregisters/re-registers, repairs, and validates again.",
      },
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
    recommendationSummary:
      "Programmable browser candidate for scraping/browser automation with lower overhead than full Chrome in some workflows.",
    recommendationMemo: {
      deploymentRole: "research",
      recommendation:
        "Research Lightpanda as a lower-overhead browser backend, but do not present it as a Chrome/Playwright replacement until target-page compatibility and install lifecycle are dogfooded.",
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
    maintenanceNotes: [
      "Track nightly binary install/update strategy, Docker image availability, CDP compatibility, and unsupported Web APIs per platform.",
    ],
    safetyBoundaries: ["Do not bypass platform authentication, consent, or anti-abuse protections."],
    knownQuirks: [
      "Browser compatibility needs validation against real target pages.",
      "Web API support is partial and work-in-progress, so Chrome parity should not be assumed.",
    ],
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
    recommendationSummary:
      "Local late-interaction retrieval candidate for reasoning-intensive retrieval and possible Ambient-specific retriever training.",
    recommendationMemo: {
      deploymentRole: "research",
      recommendation:
        "Use Reason-ModernColBERT as the first local late-interaction retrieval research candidate for Ambient-owned corpus/index experiments; do not promote it until index lifecycle, license/data lineage, and baseline quality are proven.",
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
    tradeoffs: [
      "Needs corpus/index integration",
      "License and data lineage need review before recommendation",
      "Late-interaction indexing is more complex than simple embeddings",
    ],
    avoidWhen: [
      "The user needs a simple deterministic retrieval baseline today",
      "Commercial license/data constraints have not been reviewed for the intended use",
    ],
    platforms: ["macos-arm64", "linux-x64"],
    hardwareFit: ["Small by modern retrieval-model standards, but indexing cost depends on corpus size"],
    capabilityBuilderDefaults: {
      provider: "Reason-ModernColBERT",
      locality: "local",
      responseFormats: ["json"],
      modelAssets: ["lightonai/Reason-ModernColBERT"],
    },
    ambientContract: {
      commandContract:
        "Retriever wrapper must build/query an explicit local corpus index and return ranked document ids/snippets with scores.",
      descriptorRequirements: ["model asset declaration", "index state notes", "corpus provenance notes", "response format declaration"],
      artifactPolicy: "Persist index state and evaluation outputs by path; return only bounded ranked previews to Pi.",
      validationTarget: "Build a tiny local index, retrieve against a fixed corpus, and compare ranking to BM25/vector baselines.",
    },
    secrets: [],
    networkHosts: [],
    modelAssets: [
      {
        name: "lightonai/Reason-ModernColBERT",
        sourceUrl: "https://huggingface.co/lightonai/Reason-ModernColBERT",
        licenseNote: "Review non-commercial training-data constraints before promotion.",
        cachePolicy: "Local model cache plus explicit corpus index directory.",
      },
    ],
    localArtifactReadiness: {
      status: "conditional-local",
      verifiedArtifacts: ["Hugging Face model card", "PyLate/ColBERT usage path", "long-document retrieval notes"],
      missingOrBlockingArtifacts: [
        "Ambient-specific corpus/index adapter",
        "license/data-lineage approval",
        "task-quality comparison against simpler baselines",
      ],
      minimumLocalSmokeTest:
        "Build a two-document index and verify a fixed reasoning query ranks the intended document above the distractor.",
    },
    runtimeState: { externalService: false, serviceKind: "none", statePaths: ["retrieval index directory", "model cache"] },
    costPrivacyNotes: ["Local corpus indexing avoids cloud upload when model/assets are local."],
    maintenanceNotes: [
      "Track corpus provenance, index refresh policy, PyLate/Sentence Transformers/runtime versions, model-cache revision, and baseline comparison results.",
    ],
    safetyBoundaries: [
      "Do not treat retrieval scores as verified facts or promote for commercial use until license constraints are reviewed.",
    ],
    knownQuirks: [
      "Late-interaction retrieval requires index-specific storage and can be harder to package than simple dense embeddings.",
      "The model is small by current retrieval standards but still requires explicit corpus/index state.",
    ],
    researchStatus: "researched",
    evidence: [
      {
        date: reviewedAt,
        type: "docs-review",
        summary:
          "Hugging Face model card reviewed as a high-priority local retrieval research card with PyLate/ColBERT usage path and 0.1B model size.",
      },
    ],
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
      recommendation:
        "Use AgentIR as a specialized deep-research retrieval component when the retriever should embed the agent reasoning trace with the query; do not present it as a standalone deep-research provider.",
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
      missingOrBlockingArtifacts: [
        "Complete deep-research agent orchestration",
        "Ambient-owned corpus/index adapter",
        "baseline comparison evidence",
      ],
      minimumLocalSmokeTest:
        "Embed one reasoning/query pair and two docs, then verify ranking output against BM25/simple-vector and Reason-ModernColBERT baselines.",
    },
    runtimeState: { externalService: false, serviceKind: "none", statePaths: ["retrieval index directory"] },
    costPrivacyNotes: ["Local model and corpus processing can avoid cloud upload."],
    maintenanceNotes: [
      "Track corpus provenance, index refresh policy, model cache size, device/runtime requirements, and repo/model revision.",
    ],
    safetyBoundaries: ["Do not represent retrieval scores as verified facts."],
    knownQuirks: [
      "Useful as infrastructure, not a standalone answerer.",
      "The 4B retriever is heavier than standard embedding baselines and should be justified by reasoning-trace quality wins.",
    ],
    researchStatus: "researched",
    evidence: [
      {
        date: reviewedAt,
        type: "docs-review",
        summary:
          "AgentIR model card and repo expose model, code, data, project page, paper, and quick Transformers usage for component smoke tests.",
      },
    ],
    docs: [
      { label: "AgentIR model", url: "https://huggingface.co/Tevatron/AgentIR-4B", lastReviewed: reviewedAt },
      { label: "AgentIR code", url: "https://github.com/texttron/AgentIR", lastReviewed: reviewedAt },
    ],
  },
];
