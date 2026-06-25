import type { ProviderCatalogEntry } from "./providerCatalogTypes";

const reviewedAt = "2026-05-11";

export const providerCatalogSocialAgenticEntries: ProviderCatalogEntry[] = [
  {
    id: "social.bluesky-atproto",
    displayName: "Bluesky / AT Protocol",
    capabilityArea: "social-media",
    installerShape: "connector",
    providerKind: "hybrid",
    sourceModel: "open-source",
    recommendationTier: "conditional",
    recommendationSummary:
      "First social API dogfood candidate for draft-approved posting because AT Protocol exposes explicit post records, URI/CID outputs, and open docs.",
    recommendationMemo: {
      deploymentRole: "primary",
      recommendation:
        "Use Bluesky / AT Protocol as the first social-media API dogfood candidate for draft-approved posts, not autonomous posting. It has clear record semantics (`app.bsky.feed.post`), post result URI/CID outputs, and lower platform-approval friction than X or LinkedIn.",
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
    tradeoffs: [
      "App passwords/session JWTs need careful secret handling",
      "PDS/AppView routing can confuse wrapper design",
      "Writes are public/reputation-affecting",
    ],
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
      commandContract:
        "Connector must support read/draft preview first; write/delete operations require explicit approval and return URI/CID plus audit metadata.",
      descriptorRequirements: [
        "connector shape",
        "secret env BLUESKY_APP_PASSWORD",
        "target handle/DID",
        "PDS host",
        "preview/approval boundary",
        "audit output",
      ],
      artifactPolicy: "Persist sanitized draft payloads, approval records, post URI/CID, deletion results, and rate-limit/error notes.",
      validationTarget:
        "Create a session, build a draft preview, and only after explicit approval create a tiny post, verify URI/CID, and optionally delete it.",
    },
    secrets: [{ envName: "BLUESKY_APP_PASSWORD", required: true, capture: "ambient_capability_builder_secret_request" }],
    networkHosts: ["bsky.social", "api.bsky.app", "public.api.bsky.app"],
    modelAssets: [],
    localArtifactReadiness: {
      status: "hosted-reference",
      verifiedArtifacts: [
        "createSession quickstart",
        "app.bsky.feed.post record schema",
        "URI/CID response",
        "API host/auth docs",
        "rate-limit docs",
      ],
      missingOrBlockingArtifacts: ["Credentialed Ambient connector smoke test", "approval UI for social writes"],
      minimumLocalSmokeTest:
        "Create an authenticated session, render a draft preview, then with explicit approval create and verify a tiny post URI/CID.",
    },
    runtimeState: {
      externalService: true,
      serviceKind: "hosted-api",
      statePaths: ["session token cache", "draft preview", "post URI/CID audit record"],
      healthCheck: "Authenticated profile/session check before any draft or write.",
    },
    costPrivacyNotes: [
      "Cloud/social network action; posts may be public and indexed. Authentication secrets and session JWTs must never be exposed.",
    ],
    maintenanceNotes: [
      "Track OAuth/app-password guidance, PDS/AppView host behavior, write rate limits, media upload limits, and post record schema changes.",
    ],
    safetyBoundaries: [
      "No autonomous posting, liking, following, reposting, or deletion; require account confirmation and explicit approval for every write.",
    ],
    knownQuirks: ["Public reads can use cached AppView hosts, but writes go through the account PDS and produce repository records."],
    researchStatus: "researched",
    evidence: [
      {
        date: reviewedAt,
        type: "docs-review",
        summary: "Bluesky docs expose createSession, post record schema, URI/CID outputs, API host routing, and rate-limit guidance.",
      },
    ],
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
    recommendationSummary:
      "Fediverse social connector candidate with granular OAuth scopes and idempotency-key support for status creation.",
    recommendationMemo: {
      deploymentRole: "fallback",
      recommendation:
        "Use Mastodon API when the user wants a fediverse/ActivityPub social provider and can specify the target instance. It is attractive for V1 dogfood because status creation supports granular OAuth scopes and `Idempotency-Key`, but instance variance means every wrapper must declare host, scopes, visibility, and media behavior.",
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
    tradeoffs: [
      "Instance capabilities and limits vary",
      "OAuth app setup is per instance",
      "Public/reputation impact still requires approval",
    ],
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
      commandContract:
        "Connector drafts first; status create/delete/schedule operations require explicit approval, account confirmation, and idempotency/audit metadata.",
      descriptorRequirements: [
        "connector shape",
        "secret env MASTODON_ACCESS_TOKEN",
        "instance host",
        "OAuth scopes",
        "preview/approval boundary",
        "idempotency key",
      ],
      artifactPolicy:
        "Persist sanitized draft payloads, approval records, status ids/URLs, deletion responses, and instance/rate-limit notes.",
      validationTarget:
        "Verify account identity and scopes, draft one tiny status, then with explicit approval post with Idempotency-Key and verify status id/URL.",
    },
    secrets: [{ envName: "MASTODON_ACCESS_TOKEN", required: true, capture: "ambient_capability_builder_secret_request" }],
    networkHosts: ["configured Mastodon instance host"],
    modelAssets: [],
    localArtifactReadiness: {
      status: "hosted-reference",
      verifiedArtifacts: ["status creation docs", "OAuth scope docs", "Idempotency-Key support", "delete-and-redraft source behavior"],
      missingOrBlockingArtifacts: ["Credentialed Ambient connector smoke test", "instance-selection UI and approval surface"],
      minimumLocalSmokeTest:
        "Authenticate against one chosen instance, draft a status, post with Idempotency-Key after approval, verify status id/URL, and optionally delete.",
    },
    runtimeState: {
      externalService: true,
      serviceKind: "hosted-api",
      statePaths: ["instance config", "OAuth token cache", "draft preview", "status id/URL audit record"],
      healthCheck: "GET account/verify credentials on the configured instance.",
    },
    costPrivacyNotes: [
      "Usually no API charge, but posts are public or semi-public according to instance visibility and federation behavior.",
    ],
    maintenanceNotes: [
      "Track target instance version, OAuth scopes, status parameters, idempotency behavior, visibility defaults, scheduling support, and media upload constraints.",
    ],
    safetyBoundaries: [
      "No autonomous posting, boosting, favoriting, following, pinning, deletion, or scheduled posting without explicit approval.",
    ],
    knownQuirks: [
      "Mastodon API behavior can vary by server version and instance policy; the provider card must not imply one global host.",
    ],
    researchStatus: "researched",
    evidence: [
      {
        date: reviewedAt,
        type: "docs-review",
        summary: "Mastodon docs expose status create/delete, granular OAuth scopes, scheduled statuses, and Idempotency-Key support.",
      },
    ],
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
    recommendationSummary:
      "Reserved closed-platform social connector for X posting/search workflows when official API access and user OAuth are approved.",
    recommendationMemo: {
      deploymentRole: "reserved",
      recommendation:
        "Use X API only when the user's target audience requires X and the official developer app, user OAuth, pricing/rate limits, and platform policy are accepted. Keep the V1 posture draft/read-first; posting, deleting, replying, quoting, liking, or following must be approval-gated.",
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
    avoidWhen: [
      "The user lacks approved X API access",
      "The workflow would bypass official APIs",
      "The user expects autonomous public posting",
    ],
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
      commandContract:
        "Connector supports read/draft first; X write/delete/reply/quote actions require explicit approval and audit metadata.",
      descriptorRequirements: [
        "connector shape",
        "secret env X_USER_ACCESS_TOKEN",
        "developer app access notes",
        "user OAuth scope notes",
        "preview/approval boundary",
        "audit output",
      ],
      artifactPolicy:
        "Persist sanitized draft payloads, approval records, Post ids, lookup/delete responses, rate-limit/error notes, and cost/policy notes.",
      validationTarget:
        "Verify account/app access, draft one tiny Post, then after approval create and look up the Post id through official X API endpoints.",
    },
    secrets: [{ envName: "X_USER_ACCESS_TOKEN", required: true, capture: "ambient_capability_builder_secret_request" }],
    networkHosts: ["api.x.com"],
    modelAssets: [],
    localArtifactReadiness: {
      status: "hosted-reference",
      verifiedArtifacts: [
        "X API overview",
        "Manage Posts endpoints",
        "Post lookup endpoints",
        "rate-limit docs",
        "user OAuth prerequisite",
      ],
      missingOrBlockingArtifacts: ["Credentialed Ambient OAuth connector smoke test", "pricing/rate-limit guardrail UI"],
      minimumLocalSmokeTest:
        "With approved X app/user token, perform a read-only lookup, draft a post, then with explicit approval create and verify a tiny Post id.",
    },
    runtimeState: {
      externalService: true,
      serviceKind: "hosted-api",
      statePaths: ["OAuth token cache", "draft preview", "Post id audit record"],
      healthCheck: "Read-only authenticated user or Post lookup before drafting.",
    },
    costPrivacyNotes: [
      "X API is pay-per-use/plan-limited; public posts and account actions affect reputation and may incur platform costs or quota use.",
    ],
    maintenanceNotes: [
      "Track pricing/access changes, rate limits, OAuth requirements, manage-post endpoint behavior, media upload requirements, and policy changes.",
    ],
    safetyBoundaries: [
      "No unofficial API bypasses; no autonomous public posting/deleting/replying/liking/following; explicit approval is mandatory for every write.",
    ],
    knownQuirks: [
      "Self-serve reply and posting constraints can be narrower than users expect; media must be uploaded separately before attaching to a Post.",
    ],
    researchStatus: "researched",
    evidence: [
      {
        date: reviewedAt,
        type: "docs-review",
        summary:
          "X docs reviewed for pay-per-use overview, Manage Posts create/delete endpoints, lookup endpoints, rate limits, and OAuth prerequisites.",
      },
    ],
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
    recommendationSummary:
      "Reserved professional-network connector because LinkedIn posting depends on product permissions, versioned APIs, and member or organization scopes.",
    recommendationMemo: {
      deploymentRole: "reserved",
      recommendation:
        "Use LinkedIn Posts API only for professional-network workflows where the app has the right LinkedIn product permissions and the user approves the target member or organization account. It should remain reserved until OAuth/product approval and version-header handling are dogfooded.",
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
    tradeoffs: [
      "Product/app approval and scopes can block use",
      "Version headers change over time",
      "Organization posts require page roles",
    ],
    avoidWhen: [
      "The app lacks LinkedIn product permissions",
      "The target author/account is ambiguous",
      "The user expects generic social posting",
    ],
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
      commandContract:
        "Connector supports read/draft first; LinkedIn create/update/delete actions require explicit approval, author URN confirmation, scopes, and version headers.",
      descriptorRequirements: [
        "connector shape",
        "secret env LINKEDIN_ACCESS_TOKEN",
        "author URN",
        "scope/page-role notes",
        "Linkedin-Version header",
        "preview/approval boundary",
      ],
      artifactPolicy:
        "Persist sanitized draft payloads, approval records, post URNs, retrieve/delete responses, version-header notes, and permission errors.",
      validationTarget:
        "Verify API version/scopes/author URN, draft one post, and only after approval create and retrieve a tiny post with AUTHOR context.",
    },
    secrets: [{ envName: "LINKEDIN_ACCESS_TOKEN", required: true, capture: "ambient_capability_builder_secret_request" }],
    networkHosts: ["api.linkedin.com"],
    modelAssets: [],
    localArtifactReadiness: {
      status: "hosted-reference",
      verifiedArtifacts: ["Posts API docs", "member/organization scope table", "version-header docs", "protocol header docs"],
      missingOrBlockingArtifacts: ["LinkedIn app/product approval dogfood", "OAuth connector flow", "organization role validation"],
      minimumLocalSmokeTest:
        "With approved access, validate version headers and author URN, draft a post, then with approval create/retrieve/delete a tiny post.",
    },
    runtimeState: {
      externalService: true,
      serviceKind: "hosted-api",
      statePaths: ["OAuth token cache", "draft preview", "post URN audit record", "API version config"],
      healthCheck: "Read-only profile/post/page validation before drafting.",
    },
    costPrivacyNotes: [
      "No generic API fee assumed, but app approval, product access, and professional reputation risk are the main constraints.",
    ],
    maintenanceNotes: [
      "Track monthly Marketing API versions, sunset notices, required headers, scope restrictions, organization role requirements, and content schema changes.",
    ],
    safetyBoundaries: [
      "No autonomous posting, updating, deleting, commenting, or liking; explicit account/author confirmation and approval are mandatory.",
    ],
    knownQuirks: [
      "The versioned Posts API replaces older ugcPosts/shares paths; restricted scopes and page roles often block otherwise-correct requests.",
    ],
    researchStatus: "researched",
    evidence: [
      {
        date: reviewedAt,
        type: "docs-review",
        summary:
          "LinkedIn Posts API and versioning docs reviewed for create/retrieve/delete endpoints, headers, member/organization scopes, and restricted access caveats.",
      },
    ],
    docs: [
      {
        label: "LinkedIn Posts API",
        url: "https://learn.microsoft.com/en-us/linkedin/marketing/community-management/shares/posts-api",
        lastReviewed: reviewedAt,
      },
      {
        label: "LinkedIn API versioning",
        url: "https://learn.microsoft.com/en-us/linkedin/marketing/versioning",
        lastReviewed: reviewedAt,
      },
      {
        label: "Share on LinkedIn",
        url: "https://learn.microsoft.com/en-us/linkedin/consumer/integrations/self-serve/share-on-linkedin",
        lastReviewed: reviewedAt,
      },
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
    recommendationSummary:
      "First agentic-service/payment workflow candidate, limited to sandbox/test mode, previews, idempotency, and explicit approval.",
    recommendationMemo: {
      deploymentRole: "primary",
      recommendation:
        "Use Stripe Sandbox as the first agentic-services provider card because Stripe has strong sandbox/test-mode docs, idempotent requests, PaymentIntent lifecycle guidance, and refund APIs. Keep V1 sandbox-only: no autonomous money movement, no live-mode keys, and no charge/refund/subscription mutation without typed preview and explicit approval.",
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
    tradeoffs: [
      "High-risk domain even in sandbox",
      "Live mode must be rejected in V1",
      "Rollback is not universal; refunds/reversals have constraints",
    ],
    avoidWhen: [
      "The user wants autonomous live payments",
      "The task requires bank movement or production charges",
      "A typed approval/audit surface is unavailable",
    ],
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
      commandContract:
        "Connector is sandbox-only in V1; read/create/update/refund-like actions require typed preview, explicit approval, idempotency key, object readback, and audit metadata.",
      descriptorRequirements: [
        "connector shape",
        "secret env STRIPE_SECRET_KEY",
        "sandbox/live-mode guard",
        "typed preview",
        "explicit approval boundary",
        "idempotency key",
        "audit output",
      ],
      artifactPolicy:
        "Persist sanitized previews, approval records, Stripe request ids, object ids, mode/key-prefix checks, readback responses, and rollback/reversal notes.",
      validationTarget:
        "Reject live keys, create a sandbox preview, then with explicit approval create and retrieve a tiny sandbox object using Idempotency-Key.",
    },
    secrets: [
      { envName: "STRIPE_SECRET_KEY", required: true, capture: "ambient_capability_builder_secret_request" },
      { envName: "STRIPE_WEBHOOK_SECRET", required: false, capture: "ambient_capability_builder_secret_request" },
    ],
    networkHosts: ["api.stripe.com"],
    modelAssets: [],
    localArtifactReadiness: {
      status: "hosted-reference",
      verifiedArtifacts: [
        "sandbox/test-mode docs",
        "API key prefix docs",
        "idempotent request docs",
        "PaymentIntent lifecycle docs",
        "refund docs",
      ],
      missingOrBlockingArtifacts: [
        "Credentialed sandbox Ambient connector smoke test",
        "typed high-risk approval UI",
        "webhook readback validation",
      ],
      minimumLocalSmokeTest:
        "With `sk_test_`, draft a typed preview, then after approval create and retrieve one sandbox object using Idempotency-Key and save audit metadata.",
    },
    runtimeState: {
      externalService: true,
      serviceKind: "hosted-api",
      statePaths: ["secret mode check", "typed preview", "approval record", "Stripe object/request id audit record"],
      healthCheck: "Read-only authenticated API call with sandbox key prefix validation.",
    },
    costPrivacyNotes: ["Sandbox/test mode avoids real money movement; live keys and live transactions are explicitly out of V1 scope."],
    maintenanceNotes: [
      "Track Stripe API version, sandbox/test-mode behavior, idempotency semantics, PaymentIntent lifecycle, refund constraints, webhook signatures, and request id logging.",
    ],
    safetyBoundaries: [
      "No autonomous money movement; no live-mode keys; every mutation needs typed preview, explicit approval, idempotency key, and audit trail.",
    ],
    knownQuirks: [
      "Test mode sandboxes can share some settings with live mode; assume Dashboard setting changes may affect live mode unless Stripe clearly labels them isolated.",
    ],
    researchStatus: "researched",
    evidence: [
      {
        date: reviewedAt,
        type: "docs-review",
        summary:
          "Stripe sandbox/test-mode, API keys, idempotent requests, PaymentIntent lifecycle, and refund docs reviewed for V1 high-risk guardrails.",
      },
    ],
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
    runtimeState: {
      externalService: true,
      serviceKind: "local-daemon",
      healthCheck: "tailscale status in a future approved integration flow.",
    },
    costPrivacyNotes: [
      "Tailscale coordination sees metadata, not encrypted tunnel contents; review current security docs during bridge design.",
    ],
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
