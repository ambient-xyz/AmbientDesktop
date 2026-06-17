import { describe, expect, it } from "vitest";
import { ambientCapabilityBuilderMcpRoutePreflight, ambientCapabilityBuilderPlanInput, ambientCapabilityBuilderPlanText } from "./agentRuntimeCapabilityBuilderInput";

describe("Capability Builder catalog-backed planning", () => {
  it("requires MCP autowire before planning MCP GitHub repositories as generated capabilities", () => {
    const input = ambientCapabilityBuilderPlanInput({
      goal: "Install https://github.com/bjmhe-archived/mermaid-grammer-inspector-mcp as an Ambient capability.",
      capabilityName: "mermaid-grammar-inspector",
      kind: "CLI tool",
      installerShape: "custom-cli",
      provider: "@bjmhe/mermaid-grammer-inspector-mcp",
      locality: "local",
      notes: "A Model Context Protocol server using npx over stdio.",
    });

    const preflight = ambientCapabilityBuilderMcpRoutePreflight(input);

    expect(preflight?.details).toMatchObject({
      status: "mcp-route-required",
      executionSkipped: true,
      nextTools: ["ambient_install_route_plan", "ambient_mcp_autowire_plan"],
    });
    expect(preflight?.text).toContain("No Capability Builder plan created");
    expect(preflight?.text).toContain("ambient_mcp_autowire_plan");
  });

  it("allows MCP-looking Capability Builder plans after MCP autowire has run", () => {
    const input = ambientCapabilityBuilderPlanInput({
      goal: "Build the generated wrapper after MCP autowire selected a normal wrapper fallback.",
      provider: "@example/example-mcp",
    });

    expect(ambientCapabilityBuilderMcpRoutePreflight(input, { mcpAutowirePlanned: true })).toBeUndefined();
  });

  it("normalizes known cloud TTS providers from provider catalog cards", () => {
    const input = ambientCapabilityBuilderPlanInput({
      goal: "Set up ElevenLabs so Ambient can read assistant replies aloud.",
      provider: "ElevenLabs",
    });

    expect(input).toMatchObject({
      installerShape: "tts-provider",
      locality: "network",
      outputFileArtifacts: ["MP3"],
      envNames: ["ELEVENLABS_API_KEY"],
      networkHosts: ["api.elevenlabs.io"],
    });
    expect(input.providerCatalogCards?.[0]).toMatchObject({
      id: "voice.elevenlabs",
      displayName: "ElevenLabs",
    });

    const text = ambientCapabilityBuilderPlanText(input);
    expect(text).toContain("Selected known provider card: ElevenLabs (voice.elevenlabs)");
    expect(text).toContain("Use the first-party ElevenLabs tts-provider template");
    expect(text).toContain("ELEVENLABS_API_KEY via ambient_capability_builder_secret_request");
    expect(text).toContain("Provider selection rules");
    expect(text).toContain("cost-incurring API use");
    expect(text).toContain("Secret boundary");
    expect(text).toContain("Health vs validation");
  });

  it("keeps research-needed xAI voice planning explicit", () => {
    const input = ambientCapabilityBuilderPlanInput({
      goal: "Set up xAI Grok TTS so Ambient can read assistant replies aloud.",
      provider: "xAI Grok TTS",
    });

    expect(input).toMatchObject({
      installerShape: "tts-provider",
      locality: "network",
      outputFileArtifacts: ["MP3", "WAV"],
      envNames: ["XAI_API_KEY"],
      networkHosts: ["api.x.ai"],
    });
    expect(input.providerCatalogCards?.[0]).toMatchObject({
      id: "voice.xai-grok-tts",
      recommendationTier: "research-needed",
    });
    expect(ambientCapabilityBuilderPlanText(input)).toContain("tier=research-needed");
  });

  it("fills search provider defaults and SearXNG operational caveats from the catalog", () => {
    const brave = ambientCapabilityBuilderPlanInput({
      goal: "Search Brave Search with an approved API key and return concise JSON results.",
      provider: "Brave Search",
      kind: "connector/API",
    });

    expect(brave).toMatchObject({
      installerShape: "search-provider",
      locality: "network",
      responseFormats: ["JSON"],
      envNames: ["BRAVE_API_KEY"],
      networkHosts: ["api.search.brave.com"],
    });
    expect(ambientCapabilityBuilderPlanText(brave)).toContain("Selected known provider card: Brave Search API (search.brave)");

    const searxng = ambientCapabilityBuilderPlanInput({
      goal: "Set up SearXNG as a self-hosted metasearch provider.",
      provider: "SearXNG",
    });

    expect(searxng).toMatchObject({
      installerShape: "search-provider",
      locality: "network",
      responseFormats: ["JSON", "html"],
      networkHosts: ["localhost"],
    });
    const text = ambientCapabilityBuilderPlanText(searxng);
    expect(text).toContain("Selected known provider card: SearXNG (search.searxng)");
    expect(text).toContain("kind=docker-compose");
    expect(text).toContain("Runtime state");
    expect(text).toContain("Regularly update the container");
    expect(text).toContain("CAPTCHA");
  });

  it("adds retrieval catalog defaults and corpus/index guardrails", () => {
    const input = ambientCapabilityBuilderPlanInput({
      goal: "Set up AgentIR as retrieval infrastructure for deep research loops.",
      provider: "AgentIR",
    });

    expect(input).toMatchObject({
      installerShape: "custom-cli",
      locality: "local",
      responseFormats: ["JSON"],
      modelAssets: ["Tevatron/AgentIR-4B"],
    });
    expect(input.providerCatalogCards?.[0]).toMatchObject({
      id: "retrieval.agentir",
      capabilityArea: "retrieval",
      localArtifactReadiness: { status: "component-only" },
    });
    expect(input.researchPlanningRisks).toEqual(
      expect.arrayContaining([
        expect.stringContaining("corpus/index state plan"),
        expect.stringContaining("BM25/SQLite FTS"),
      ]),
    );

    const text = ambientCapabilityBuilderPlanText(input);
    expect(text).toContain("Selected known provider card: AgentIR-4B (retrieval.agentir)");
    expect(text).toContain("Local artifacts: status=component-only");
    expect(text).toContain("Build a tiny local index");
    expect(text).toContain("corpus/index state");
  });

  it("keeps deep-research cards experimental with model-serving and trace requirements", () => {
    const input = ambientCapabilityBuilderPlanInput({
      goal: "Set up LiteResearcher-4B for bounded Ambient deep research experiments.",
      provider: "LiteResearcher-4B",
    });

    expect(input).toMatchObject({
      installerShape: "custom-cli",
      locality: "local",
      responseFormats: ["text", "JSON"],
      modelAssets: [
        "mradermacher/LiteResearcher-4B-GGUF:Q4_K_M",
        "mradermacher/LiteResearcher-4B-GGUF:Q8_0",
      ],
    });
    expect(input.envNames).toBeUndefined();
    expect(input.networkHosts).toEqual(["huggingface.co", "github.com", "localhost"]);
    expect(input.providerCatalogCards?.[0]).toMatchObject({
      id: "deep.literesearcher-4b",
      capabilityArea: "deep-research",
      recommendationTier: "recommended",
      localArtifactReadiness: { status: "local-ready" },
    });

    const text = ambientCapabilityBuilderPlanText(input);
    expect(text).toContain("Selected known provider card: Local Deep Research (LiteResearcher-4B) (deep.literesearcher-4b)");
    expect(text).toContain("tier=recommended");
    expect(text).toContain("Ambient-brokered search/fetch preferences");
    expect(text).toContain("Research evidence");
    expect(text).toContain("trace/source/report artifacts");
    expect(text).toContain("Env requirements: none specified yet");
    expect(text).not.toContain("SERPER_KEY_ID");
  });

  it("marks unknown retrieval or deep-research providers as higher validation risk", () => {
    const input = ambientCapabilityBuilderPlanInput({
      goal: "Set up a custom deep research agent with a local Qwen 4B model.",
      installerShape: "custom-cli",
      provider: "Acme Research Agent",
    });

    expect(input.providerCatalogCards).toBeUndefined();
    expect(input.researchPlanningRisks).toEqual(
      expect.arrayContaining([
        expect.stringContaining("No known provider catalog card matched"),
        expect.stringContaining("model-serving/runtime plan"),
        expect.stringContaining("trace/source/report artifacts"),
      ]),
    );

    const text = ambientCapabilityBuilderPlanText(input);
    expect(text).toContain("higher validation risk");
    expect(text).toContain("corpus/index state plan");
    expect(text).toContain("model-serving/runtime plan");
  });

  it("fills social and agentic connector defaults with approval guardrails", () => {
    const bluesky = ambientCapabilityBuilderPlanInput({
      goal: "Set up a Bluesky connector that drafts posts and only publishes after approval.",
      provider: "Bluesky",
      kind: "connector/API",
    });

    expect(bluesky).toMatchObject({
      installerShape: "connector",
      locality: "network",
      responseFormats: ["JSON"],
      envNames: ["BLUESKY_APP_PASSWORD"],
      networkHosts: ["bsky.social", "api.bsky.app", "public.api.bsky.app"],
    });
    expect(bluesky.providerCatalogCards?.[0]).toMatchObject({
      id: "social.bluesky-atproto",
      capabilityArea: "social-media",
      recommendationTier: "conditional",
    });
    expect(bluesky.sensitiveActionPlanningGuardrails).toEqual(
      expect.arrayContaining([
        expect.stringContaining("read-only status/identity checks"),
        expect.stringContaining("Social writes must preview exact text"),
        expect.stringContaining("Do not bypass official APIs"),
      ]),
    );

    const blueskyText = ambientCapabilityBuilderPlanText(bluesky);
    expect(blueskyText).toContain("Installer shape: connector");
    expect(blueskyText).toContain("Selected known provider card: Bluesky / AT Protocol (social.bluesky-atproto)");
    expect(blueskyText).toContain("Social/agentic connector planning guardrails");
    expect(blueskyText).toContain("Sensitive writes");
    expect(blueskyText).toContain("URI/CID");
    expect(blueskyText).toContain("BLUESKY_APP_PASSWORD via ambient_capability_builder_secret_request");

    const stripe = ambientCapabilityBuilderPlanInput({
      goal: "Set up Stripe Sandbox for typed previews and sandbox PaymentIntent smoke tests.",
      provider: "Stripe",
      kind: "connector/API",
    });

    expect(stripe).toMatchObject({
      installerShape: "connector",
      locality: "network",
      responseFormats: ["JSON"],
      envNames: ["STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET"],
      networkHosts: ["api.stripe.com"],
    });
    expect(stripe.providerCatalogCards?.[0]).toMatchObject({
      id: "agentic-services.stripe-sandbox",
      capabilityArea: "agentic-services",
      recommendationTier: "conditional",
    });
    expect(stripe.sensitiveActionPlanningGuardrails).toEqual(
      expect.arrayContaining([
        expect.stringContaining("sandbox-only/read/draft-first"),
        expect.stringContaining("Money-affecting actions must include typed preview"),
        expect.stringContaining("Reject live payment/banking keys"),
      ]),
    );

    const stripeText = ambientCapabilityBuilderPlanText(stripe);
    expect(stripeText).toContain("Selected known provider card: Stripe Sandbox (agentic-services.stripe-sandbox)");
    expect(stripeText).toContain("sandbox-only");
    expect(stripeText).toContain("Idempotency-Key");
    expect(stripeText).toContain("STRIPE_SECRET_KEY via ambient_capability_builder_secret_request");
  });
});
