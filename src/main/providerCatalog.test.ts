import { describe, expect, it } from "vitest";
import {
  getProviderCatalogEntries,
  providerCatalogBootstrapReminder,
  providerCatalogEntries,
  providerCatalogResultText,
  providerCatalogSettingsState,
  providerSelectionGuidanceForProvider,
  providerSelectionGuidanceRules,
  providerCatalogToolInput,
  queryProviderCatalog,
  runProviderCatalogTool,
  validateProviderCatalog,
} from "./providerCatalog";

describe("provider catalog", () => {
  it("ships a valid static catalog with unique ids and no secret values", () => {
    const validation = validateProviderCatalog();

    expect(validation.errors).toEqual([]);
    expect(new Set(providerCatalogEntries.map((entry) => entry.id)).size).toBe(providerCatalogEntries.length);
    expect(new Set(providerSelectionGuidanceRules.map((rule) => rule.id)).size).toBe(providerSelectionGuidanceRules.length);
    expect(providerCatalogEntries.length).toBeGreaterThanOrEqual(15);
    expect(providerCatalogEntries.flatMap((entry) => entry.secrets.map((secret) => secret.envName))).toEqual(
      expect.arrayContaining(["BRAVE_API_KEY", "CARTESIA_API_KEY", "XAI_API_KEY", "SERPER_API_KEY"]),
    );
    for (const secret of providerCatalogEntries.flatMap((entry) => entry.secrets)) {
      expect(secret.envName).toMatch(/^[A-Z0-9_]+$/);
      expect(secret.envName).not.toContain("=");
    }
  });

  it("synthesizes bounded provider-selection rules from catalog fields", () => {
    const elevenlabs = providerCatalogEntries.find((entry) => entry.id === "voice.elevenlabs");
    const piper = providerCatalogEntries.find((entry) => entry.id === "voice.piper");
    const searxng = providerCatalogEntries.find((entry) => entry.id === "search.searxng");
    const stripe = providerCatalogEntries.find((entry) => entry.id === "agentic-services.stripe-sandbox");
    expect(elevenlabs && providerSelectionGuidanceForProvider(elevenlabs)).toEqual(
      expect.arrayContaining([
        expect.stringContaining("Local vs cloud"),
        expect.stringContaining("Explicit approval"),
        expect.stringContaining("Secret boundary"),
        expect.stringContaining("Health vs validation"),
      ]),
    );
    expect(piper && providerSelectionGuidanceForProvider(piper)).toEqual(
      expect.arrayContaining([
        expect.stringContaining("Good-enough local baseline"),
        expect.stringContaining("Model assets"),
      ]),
    );
    expect(searxng && providerSelectionGuidanceForProvider(searxng)).toEqual(
      expect.arrayContaining([
        expect.stringContaining("Runtime state"),
        expect.stringContaining("stale-cache recovery"),
      ]),
    );
    expect(stripe && providerSelectionGuidanceForProvider(stripe)).toEqual(
      expect.arrayContaining([
        expect.stringContaining("Sensitive writes"),
        expect.stringContaining("idempotency"),
      ]),
    );

    const text = providerCatalogResultText(queryProviderCatalog({ capabilityArea: "voice-generation", limit: 1 }));
    expect(text).toContain("selection=Local vs cloud");
    expect(text).toContain("Health vs validation");
  });

  it("matches natural-language provider goals without requiring exact sentence substrings", () => {
    const result = queryProviderCatalog({
      capabilityArea: "voice-generation",
      goal: "Which local/offline TTS provider should Ambient start with for reading assistant replies aloud?",
      limit: 3,
    });

    expect(result.providers.map((provider) => provider.id)).toContain("voice.piper");
  });

  it("keeps directly named provider cards when the goal includes downstream task context", () => {
    const result = queryProviderCatalog({
      capabilityArea: "voice-generation",
      installerShape: "tts-provider",
      goal: "ElevenLabs text-to-speech for HyperFrames video narration",
      limit: 10,
    });

    expect(result.providers.map((provider) => provider.id)).toContain("voice.elevenlabs");
  });

  it("projects the catalog into renderer-safe settings cards from the same source", () => {
    const state = providerCatalogSettingsState(new Date("2026-05-11T12:00:00.000Z"));
    const piper = state.cards.find((card) => card.id === "voice.piper");
    const elevenlabs = state.cards.find((card) => card.id === "voice.elevenlabs");
    const minicpm = state.cards.find((card) => card.id === "vision.minicpm-v");
    const tinystyler = state.cards.find((card) => card.id === "writing.tinystyler");

    expect(state).toMatchObject({
      catalogVersion: expect.any(String),
      generatedAt: "2026-05-11T12:00:00.000Z",
    });
    expect(state.cards).toHaveLength(providerCatalogEntries.length);
    expect(piper).toMatchObject({
      displayName: "Piper",
      capabilityArea: "voice-generation",
      installerShape: "tts-provider",
      ambientContract: {
        validationTarget: expect.stringContaining("tiny WAV"),
      },
      capabilityBuilderDefaults: {
        provider: "Piper",
        locality: "local",
      },
    });
    expect(elevenlabs?.secrets).toEqual([
      expect.objectContaining({
        envName: "ELEVENLABS_API_KEY",
        capture: "ambient_capability_builder_secret_request",
      }),
    ]);
    expect(minicpm).toMatchObject({
      displayName: "MiniCPM-V",
      capabilityArea: "visual-understanding",
      installerShape: "vision-analysis-provider",
      recommendationTier: "recommended",
      deploymentRole: "primary",
      localArtifactStatus: "local-ready",
      firstPartyTemplate: {
        available: true,
        templateId: "vision-analysis-provider:minicpm-v-llamacpp",
      },
      platformSupport: expect.arrayContaining([
        expect.objectContaining({ platform: "macos-arm64", status: "supported" }),
        expect.objectContaining({ platform: "linux-x64", status: "supported" }),
        expect.objectContaining({ platform: "windows-x64", status: "experimental" }),
      ]),
    });
    expect(minicpm?.minimumLocalSmokeTest).toContain("typed Ambient visual tool");
    expect(tinystyler).toMatchObject({
      displayName: "TinyStyler writing-style transfer",
      capabilityArea: "writing-style-transfer",
      installerShape: "custom-cli",
      recommendationTier: "conditional",
      deploymentRole: "primary",
      localArtifactStatus: "conditional-local",
      firstPartyTemplate: {
        available: true,
        templateId: "ambient-cli:ambient-tinystyler",
      },
      ambientContract: {
        validationTarget: expect.stringContaining("tinystyler"),
      },
      modelAssets: expect.arrayContaining([
        expect.objectContaining({ name: "tinystyler-transfer-weights", expectedSize: "3.14 GB" }),
        expect.objectContaining({ name: "t5-v1_1-large-backbone", expectedSize: "3.13 GB" }),
      ]),
    });
    expect(tinystyler?.minimumLocalSmokeTest).toContain("tinystyler_transfer");
    expect(JSON.stringify(state.cards)).not.toContain("sk-");
  });

  it("keeps the bootstrap reminder concise and card-free", () => {
    expect(providerCatalogBootstrapReminder).toContain("web_research_provider_search");
    expect(providerCatalogBootstrapReminder).toContain("web_research_provider_describe");
    expect(providerCatalogBootstrapReminder).toContain("ambient_tool_call");
    expect(providerCatalogBootstrapReminder).toContain("ambient_provider_catalog");
    expect(providerCatalogBootstrapReminder).toContain("broaden overly specific goal/provider filters");
    expect(providerCatalogBootstrapReminder).toContain("ambient_capability_builder_plan");
    expect(providerCatalogBootstrapReminder).toContain("installed-provider status tools");
    expect(providerCatalogBootstrapReminder).toContain("Keep catalog queries bounded");
    expect(providerCatalogBootstrapReminder).not.toContain("Piper");
    expect(providerCatalogBootstrapReminder).not.toContain("ElevenLabs");
    expect(providerCatalogBootstrapReminder.length).toBeLessThan(1_000);
  });

  it("returns recommended and conditional web search cards before experimental entries", () => {
    const result = queryProviderCatalog(
      { capabilityArea: "web-search", includeExperimental: true, includeNeedsResearch: true },
      new Date("2026-05-11T00:00:00.000Z"),
    );

    expect(result.generatedAt).toBe("2026-05-11T00:00:00.000Z");
    expect(result.providers.map((provider) => provider.id)).toEqual([
      "search.brave",
      "search.google-programmable",
      "search.google-browser",
      "search.searxng",
    ]);
    expect(providerCatalogResultText(result)).toContain("Ambient provider catalog");
    expect(providerCatalogResultText(result)).toContain("Use Ambient-managed secret capture");
  });

  it("encodes Phase 4 web-search and retrieval recommendation memos", () => {
    const search = queryProviderCatalog({ capabilityArea: "web-search", includeExperimental: true, includeNeedsResearch: true });
    expect(search.providers.map((provider) => provider.id)).toEqual([
      "search.brave",
      "search.google-programmable",
      "search.google-browser",
      "search.searxng",
    ]);
    expect(search.providers[0]).toMatchObject({
      id: "search.brave",
      recommendationTier: "recommended",
      researchStatus: "live-dogfooded",
      recommendationMemo: {
        deploymentRole: "primary",
        recommendation: expect.stringContaining("first API-backed web search provider"),
        fallbackGuidance: expect.arrayContaining([expect.stringContaining("SearXNG")]),
      },
      evidence: expect.arrayContaining([
        expect.objectContaining({
          type: "credentialed-smoke",
          summary: expect.stringContaining("Phase 5 live Pi dogfood reran Brave Search"),
        }),
      ]),
    });
    expect(search.providers.find((provider) => provider.id === "search.google-programmable")).toMatchObject({
      recommendationMemo: {
        deploymentRole: "reserved",
        recommendation: expect.stringContaining("closed to new customers"),
        promotionCriteria: expect.arrayContaining([expect.stringContaining("January 1, 2027")]),
      },
    });
    expect(search.providers.find((provider) => provider.id === "search.searxng")).toMatchObject({
      recommendationMemo: {
        deploymentRole: "fallback",
        promotionCriteria: expect.arrayContaining([expect.stringContaining("start, stop, status-check, update")]),
      },
    });
    expect(providerCatalogResultText(search)).toContain("memoRole=primary");
    expect(providerCatalogResultText(search)).toContain("closed to new customers");

    const retrieval = queryProviderCatalog({ capabilityArea: "retrieval", includeExperimental: true });
    expect(retrieval.providers.map((provider) => provider.id)).toEqual(
      expect.arrayContaining(["retrieval.reason-moderncolbert", "retrieval.agentir"]),
    );
    expect(retrieval.providers.find((provider) => provider.id === "retrieval.reason-moderncolbert")).toMatchObject({
      recommendationMemo: {
        deploymentRole: "research",
        dogfoodTargets: expect.arrayContaining([expect.stringContaining("two-to-five document corpus")]),
        promotionCriteria: expect.arrayContaining([expect.stringContaining("BM25/simple-vector")]),
      },
    });
    expect(retrieval.providers.find((provider) => provider.id === "retrieval.agentir")).toMatchObject({
      recommendationMemo: {
        deploymentRole: "research",
        fallbackGuidance: expect.arrayContaining([expect.stringContaining("Reason-ModernColBERT")]),
      },
      localArtifactReadiness: {
        missingOrBlockingArtifacts: expect.arrayContaining([expect.stringContaining("baseline comparison evidence")]),
      },
    });
    expect(providerCatalogResultText(retrieval)).toContain("memoRole=research");
    expect(providerCatalogResultText(retrieval)).toContain("BM25/simple-vector");
  });

  it("encodes Phase 4 voice-generation recommendation memos", () => {
    const defaultVoice = queryProviderCatalog({ capabilityArea: "voice-generation" });
    expect(defaultVoice.providers.map((provider) => provider.id)).not.toContain("voice.xai-grok-tts");

    const voice = queryProviderCatalog({ capabilityArea: "voice-generation", includeNeedsResearch: true });
    expect(voice.providers.map((provider) => provider.id)).toEqual([
      "voice.piper",
      "voice.cartesia",
      "voice.elevenlabs",
      "voice.kokoro-onnx",
      "voice.xai-grok-tts",
    ]);
    expect(voice.providers[0]).toMatchObject({
      id: "voice.piper",
      recommendationTier: "recommended",
      researchStatus: "live-dogfooded",
      recommendationMemo: {
        deploymentRole: "primary",
        recommendation: expect.stringContaining("default local/offline TTS provider"),
        fallbackGuidance: expect.arrayContaining([expect.stringContaining("Kokoro ONNX")]),
      },
      knownQuirks: expect.arrayContaining([expect.stringContaining("provider-local models directory")]),
      evidence: expect.arrayContaining([
        expect.objectContaining({
          type: "local-smoke",
          summary: expect.stringContaining("Phase 5 live Pi dogfood copied cached en_US-lessac-medium Piper"),
        }),
      ]),
    });
    expect(voice.providers.find((provider) => provider.id === "voice.kokoro-onnx")).toMatchObject({
      recommendationMemo: {
        deploymentRole: "fallback",
        dogfoodTargets: expect.arrayContaining([expect.stringContaining("kokoro-v1.0.int8.onnx")]),
      },
      knownQuirks: expect.arrayContaining([expect.stringContaining("1,000 characters or less")]),
    });
    expect(voice.providers.find((provider) => provider.id === "voice.elevenlabs")).toMatchObject({
      researchStatus: "live-dogfooded",
      recommendationMemo: {
        deploymentRole: "fallback",
        promotionCriteria: expect.arrayContaining([expect.stringContaining("no secret leakage")]),
      },
      evidence: expect.arrayContaining([
        expect.objectContaining({
          type: "credentialed-smoke",
          summary: expect.stringContaining("Phase 5 live Pi dogfood reran the approved ElevenLabs"),
        }),
      ]),
    });
    expect(voice.providers.find((provider) => provider.id === "voice.cartesia")).toMatchObject({
      researchStatus: "live-dogfooded",
      recommendationMemo: {
        deploymentRole: "fallback",
        dogfoodTargets: expect.arrayContaining([expect.stringContaining("time-to-first-byte")]),
      },
      evidence: expect.arrayContaining([
        expect.objectContaining({
          type: "credentialed-smoke",
          summary: expect.stringContaining("Phase 5 live Pi dogfood reran the approved Cartesia"),
        }),
      ]),
    });
    expect(voice.providers.find((provider) => provider.id === "voice.xai-grok-tts")).toMatchObject({
      recommendationTier: "research-needed",
      recommendationMemo: {
        deploymentRole: "research",
        recommendation: expect.stringContaining("xAI now documents a TTS API"),
        promotionCriteria: expect.arrayContaining([expect.stringContaining("Credentialed Ambient dogfood succeeds")]),
      },
    });
    expect(providerCatalogResultText(voice)).toContain("memoRole=primary");
    expect(providerCatalogResultText(voice)).toContain("XAI_API_KEY");
  });

  it("shows the promoted Local Deep Research card by default while keeping lab cards behind explicit include flags", () => {
    const defaultResult = queryProviderCatalog({ capabilityArea: "deep-research" });
    expect(defaultResult.providers.map((provider) => provider.id)).toEqual(["deep.literesearcher-4b"]);
    expect(defaultResult.providers[0]).toMatchObject({
      recommendationTier: "recommended",
      localArtifactReadiness: { status: "local-ready" },
      recommendationMemo: { deploymentRole: "primary" },
    });

    const result = queryProviderCatalog({ capabilityArea: "deep-research", includeExperimental: true, includeNeedsResearch: true });
    const byId = new Map(result.providers.map((provider) => [provider.id, provider]));

    expect(byId.get("deep.literesearcher-4b")?.localArtifactReadiness?.status).toBe("local-ready");
    expect(byId.get("deep.openresearcher")?.localArtifactReadiness?.status).toBe("deployment-heavy");
    expect(byId.get("deep.step-deepresearch")?.localArtifactReadiness?.status).toBe("hosted-reference");
    expect(byId.get("retrieval.agentir")).toBeUndefined();
    for (const provider of result.providers) {
      expect(provider.localArtifactReadiness).toBeDefined();
      if (provider.id !== "deep.literesearcher-4b") expect(provider.recommendationTier).not.toBe("recommended");
      expect(provider.recommendationTier).not.toBe("default");
      expect(provider.recommendationMemo).toBeDefined();
    }
    expect(result.providers.map((provider) => provider.id)).toEqual(
      expect.arrayContaining([
        "deep.literesearcher-4b",
        "deep.openresearcher",
        "deep.step-deepresearch",
        "deep.dr-venus-4b",
        "deep.openseeker-v1-30b",
        "deep.infoseeker-repro-4b",
        "deep.agentcpm-explore",
      ]),
    );
    expect(byId.get("deep.literesearcher-4b")).toMatchObject({
      recommendationTier: "recommended",
      recommendationMemo: {
        deploymentRole: "primary",
        recommendation: expect.stringContaining("first-party Local Deep Research setup"),
        dogfoodTargets: expect.arrayContaining([expect.stringContaining("search/fetch trace")]),
      },
      modelAssets: expect.arrayContaining([
        expect.objectContaining({ name: "mradermacher/LiteResearcher-4B-GGUF:Q4_K_M" }),
        expect.objectContaining({ name: "mradermacher/LiteResearcher-4B-GGUF:Q8_0" }),
      ]),
    });
    expect(byId.get("deep.openresearcher")).toMatchObject({
      recommendationMemo: {
        deploymentRole: "reserved",
        promotionCriteria: expect.arrayContaining([expect.stringContaining("GPU count/VRAM")]),
        fallbackGuidance: expect.arrayContaining([expect.stringContaining("LiteResearcher-4B")]),
      },
    });
    expect(byId.get("deep.step-deepresearch")).toMatchObject({
      recommendationMemo: {
        deploymentRole: "reserved",
        recommendation: expect.stringContaining("hosted/API reference"),
        fallbackGuidance: expect.arrayContaining([expect.stringContaining("LiteResearcher-4B")]),
      },
    });
    expect(byId.get("deep.dr-venus-4b")).toMatchObject({
      recommendationMemo: {
        deploymentRole: "research",
        dogfoodTargets: expect.arrayContaining([expect.stringContaining("run_demo")]),
        promotionCriteria: expect.arrayContaining([expect.stringContaining("search/visit protocol")]),
      },
    });
    expect(byId.get("deep.openseeker-v1-30b")).toMatchObject({
      recommendationMemo: {
        deploymentRole: "reserved",
        recommendation: expect.stringContaining("31B/GPU resources"),
        dogfoodTargets: expect.arrayContaining([expect.stringContaining("run_openseeker.sh")]),
      },
    });
    expect(byId.get("deep.infoseeker-repro-4b")).toMatchObject({
      recommendationMemo: {
        deploymentRole: "research",
        recommendation: expect.stringContaining("DDGS/tool-server"),
        promotionCriteria: expect.arrayContaining([expect.stringContaining("DDGS/tool-server setup")]),
      },
    });
    expect(byId.get("deep.agentcpm-explore")).toMatchObject({
      recommendationMemo: {
        deploymentRole: "research",
        dogfoodTargets: expect.arrayContaining([expect.stringContaining("AgentCPM quickstart")]),
        promotionCriteria: expect.arrayContaining([expect.stringContaining("AgentDock/tool-service lifecycle")]),
      },
    });
    const text = providerCatalogResultText(result);
    expect(text).toContain("memoRole=primary");
    expect(text).toContain("memoRole=research");
    expect(text).toContain("memoRole=reserved");
    expect(text).toContain("hosted/API reference");
    expect(text).toContain("trace/source/report artifacts");
  });

  it("recommends MiniCPM-V visual understanding for scoped macOS/Linux lanes while keeping Windows experimental", () => {
    const defaultResult = queryProviderCatalog({ capabilityArea: "visual-understanding" });
    expect(defaultResult.providers.map((provider) => provider.id)).toEqual(["vision.minicpm-v"]);

    const result = queryProviderCatalog({ capabilityArea: "visual-understanding" });
    expect(result.providers.map((provider) => provider.id)).toEqual(["vision.minicpm-v"]);
    expect(queryProviderCatalog({ capabilityArea: "visual-understanding", platform: "windows-x64" }).providers).toEqual([]);
    expect(queryProviderCatalog({ capabilityArea: "visual-understanding", platform: "windows-x64", includeExperimental: true }).providers.map((provider) => provider.id)).toEqual(["vision.minicpm-v"]);

    const minicpm = result.providers[0];
    expect(minicpm).toMatchObject({
      id: "vision.minicpm-v",
      displayName: "MiniCPM-V",
      installerShape: "vision-analysis-provider",
      providerKind: "local",
      sourceModel: "open-source",
      recommendationTier: "recommended",
      recommendationMemo: {
        deploymentRole: "primary",
        recommendation: expect.stringContaining("MiniCPM-V 4.5 Q4_K_M"),
        dogfoodTargets: expect.arrayContaining([
          expect.stringContaining("Mac llama.cpp/GGUF smoke"),
          expect.stringContaining("Linux `drone` 24 GB GPU"),
          expect.stringContaining("real Ambient Desktop screenshot"),
        ]),
        promotionCriteria: expect.arrayContaining([
          expect.stringContaining("structured observation schema"),
          expect.stringContaining("macOS arm64 and Linux x64"),
          expect.stringContaining("Input media policy"),
        ]),
      },
      capabilityBuilderDefaults: {
        provider: "MiniCPM-V",
        locality: "local",
        responseFormats: expect.arrayContaining(["json"]),
      },
      firstPartyTemplate: {
        available: true,
        templateId: "vision-analysis-provider:minicpm-v-llamacpp",
      },
      platformSupport: expect.arrayContaining([
        expect.objectContaining({
          platform: "macos-arm64",
          status: "supported",
          runtime: expect.stringContaining("llama.cpp Metal"),
          evidence: expect.arrayContaining([
            expect.stringContaining("Mac llama.cpp 4.5 screenshot smoke"),
            expect.stringContaining("Default managed-download macOS arm64 lifecycle smoke"),
            expect.stringContaining("macOS quarantine removal/signing assessment receipt"),
            expect.stringContaining("Live Ambient/Pi typed setup/analyze dogfood"),
          ]),
          caveats: expect.arrayContaining([expect.stringContaining("Apple Silicon")]),
        }),
        expect.objectContaining({
          platform: "linux-x64",
          status: "supported",
          runtime: expect.stringContaining("llama.cpp Vulkan"),
          evidence: expect.arrayContaining([
            expect.stringContaining("Linux `drone` MiniCPM-V 4.5 runtime lifecycle smoke"),
            expect.stringContaining("Default managed-download Linux x64 Vulkan lifecycle smoke"),
          ]),
          caveats: expect.arrayContaining([expect.stringContaining("CPU-only Linux")]),
        }),
        expect.objectContaining({
          platform: "windows-x64",
          status: "experimental",
          evidence: expect.arrayContaining([expect.stringContaining("Pinned b9122 Windows x64 CPU zip artifact metadata")]),
          caveats: expect.arrayContaining([expect.stringContaining("No real Windows smoke evidence yet")]),
        }),
      ]),
      localArtifactReadiness: {
        status: "local-ready",
        verifiedArtifacts: expect.arrayContaining([
          expect.stringContaining("Mac llama.cpp 4.5 screenshot smoke"),
          expect.stringContaining("Linux `drone` RTX 4090 4.5/4.6 quality comparison"),
          expect.stringContaining("Descriptor-backed Ambient CLI vision wrapper package"),
          expect.stringContaining("Runtime acquisition/cache/preflight contract"),
          expect.stringContaining("Runtime release manifest/checksum verifier with pinned llama.cpp b9122"),
          expect.stringContaining("Pinned b9122 macOS/Linux runtime lifecycle smoke"),
          expect.stringContaining("Fresh empty-cache default-download lifecycle smoke"),
          expect.stringContaining("Pinned b9122 Windows x64 CPU zip artifact metadata"),
          expect.stringContaining("Managed local-archive runtime install with archive/binary checksum receipt and env binding"),
          expect.stringContaining("Managed zip runtime archive install path"),
          expect.stringContaining("macOS quarantine removal/signing assessment receipt"),
          expect.stringContaining("Live Ambient/Pi ambient_cli MiniCPM-V screenshot dogfood"),
          expect.stringContaining("Live Ambient/Pi typed setup/analyze dogfood"),
        ]),
        missingOrBlockingArtifacts: expect.arrayContaining([
          expect.stringContaining("Windows x64 smoke for Windows support only"),
        ]),
      },
      secrets: [],
    });
    expect(minicpm.costPrivacyNotes.join("\n")).toContain("Remote MiniCPM-V endpoints remain disabled");
    expect(minicpm.safetyBoundaries.join("\n")).toContain("allowed hosts, user consent, media privacy, secret handling, request redaction, artifact retention, network egress controls, ui copy");
    expect(minicpm.modelAssets.map((asset) => asset.name)).toEqual([
      "openbmb/MiniCPM-V-4_5-gguf",
      "openbmb/MiniCPM-V-4.6",
    ]);

    const text = providerCatalogResultText(result);
    expect(text).toContain("Visual evidence");
    expect(text).toContain("vision-analysis-provider");
    expect(text).toContain("MiniCPM-V");
    expect(text).toContain("local multimodal models as evidence-gathering tools");
    expect(text).toContain("runtime acquisition/cache/preflight contract");
    expect(text).toContain("runtime release manifest/checksum verifier");
    expect(text).toContain("Default managed-download macOS arm64 lifecycle smoke");
    expect(text).toContain("tier=recommended");
    expect(text).toContain("memoRole=primary");
    expect(text).toContain("platformSupport=macos-arm64:supported");
    expect(text).toContain("linux-x64:supported");
    expect(text).toContain("windows-x64:experimental");
    expect(text).not.toContain("AMBIENT_DRONE_SSH_PASSWORD");
    expect(text).not.toContain("ambient@drone");
  });

  it("encodes Phase 4 rich-document recommendation memos", () => {
    const defaultResult = queryProviderCatalog({ capabilityArea: "rich-documents" });
    expect(defaultResult.providers.map((provider) => provider.id)).toEqual([
      "rich-documents.ambient-artifact-runtimes",
      "rich-documents.ambient-office-extraction-preview",
      "rich-documents.google-workspace",
      "rich-documents.local-conversion-ooxml",
    ]);
    expect(defaultResult.providers.map((provider) => provider.id)).not.toContain("rich-documents.microsoft-365-graph");

    const result = queryProviderCatalog({ capabilityArea: "rich-documents", includeNeedsResearch: true });
    const byId = new Map(result.providers.map((provider) => [provider.id, provider]));
    expect(result.providers.map((provider) => provider.id)).toEqual([
      "rich-documents.ambient-artifact-runtimes",
      "rich-documents.ambient-office-extraction-preview",
      "rich-documents.google-workspace",
      "rich-documents.local-conversion-ooxml",
      "rich-documents.microsoft-365-graph",
    ]);
    for (const provider of result.providers) {
      expect(provider.recommendationMemo).toBeDefined();
    }
    expect(byId.get("rich-documents.ambient-artifact-runtimes")).toMatchObject({
      providerKind: "built-in",
      recommendationTier: "recommended",
      recommendationMemo: {
        deploymentRole: "primary",
        recommendation: expect.stringContaining("primary local rich-document path"),
        dogfoodTargets: expect.arrayContaining([expect.stringContaining("`.docx`, `.pptx`, and `.xlsx`")]),
      },
      localArtifactReadiness: {
        status: "local-ready",
      },
    });
    expect(byId.get("rich-documents.ambient-office-extraction-preview")).toMatchObject({
      recommendationMemo: {
        deploymentRole: "primary",
        recommendation: expect.stringContaining("primary rich-document reading and conversion path"),
        promotionCriteria: expect.arrayContaining([expect.stringContaining("raw OOXML package bytes")]),
      },
      localArtifactReadiness: {
        missingOrBlockingArtifacts: expect.arrayContaining([expect.stringContaining("LibreOffice")]),
      },
    });
    expect(byId.get("rich-documents.google-workspace")).toMatchObject({
      providerKind: "cloud",
      installerShape: "connector",
      recommendationMemo: {
        deploymentRole: "fallback",
        recommendation: expect.stringContaining("native collaborative Google Doc"),
        dogfoodTargets: expect.arrayContaining([expect.stringContaining("Drive export")]),
      },
    });
    expect(byId.get("rich-documents.local-conversion-ooxml")).toMatchObject({
      providerKind: "local",
      recommendationMemo: {
        deploymentRole: "fallback",
        recommendation: expect.stringContaining("local fallback stack"),
        promotionCriteria: expect.arrayContaining([expect.stringContaining("version")]),
      },
      localArtifactReadiness: {
        status: "conditional-local",
      },
    });
    expect(byId.get("rich-documents.microsoft-365-graph")).toMatchObject({
      recommendationTier: "research-needed",
      recommendationMemo: {
        deploymentRole: "reserved",
        recommendation: expect.stringContaining("reserved enterprise connector candidate"),
        promotionCriteria: expect.arrayContaining([expect.stringContaining("Microsoft OAuth/connector flow")]),
      },
    });
    const text = providerCatalogResultText(result);
    expect(text).toContain("memoRole=primary");
    expect(text).toContain("Google Workspace");
    expect(text).toContain("LibreOffice/Pandoc");
    expect(text).toContain("Microsoft 365 / Graph");
  });

  it("routes TinyStyler through the writing-style transfer catalog area", () => {
    const result = queryProviderCatalog({ capabilityArea: "writing-style-transfer" });

    expect(result.providers.map((provider) => provider.id)).toEqual(["writing.tinystyler"]);
    expect(result.providers[0]).toMatchObject({
      recommendationTier: "conditional",
      providerKind: "local",
      sourceModel: "open-source",
      installerShape: "custom-cli",
      recommendationMemo: {
        deploymentRole: "primary",
        recommendation: expect.stringContaining("ambient-tinystyler"),
      },
      firstPartyTemplate: {
        templateId: "ambient-cli:ambient-tinystyler",
      },
      localArtifactReadiness: {
        status: "conditional-local",
        minimumLocalSmokeTest: expect.stringContaining("tinystyler_profile"),
      },
      secrets: [],
    });
    expect(result.providers[0].recommendationMemo?.fallbackGuidance.some((guidance) => guidance.includes("one-off rewrite"))).toBe(
      true,
    );

    const text = providerCatalogResultText(result);
    expect(text).toContain("writing-style-transfer");
    expect(text).toContain("ambient-tinystyler");
    expect(text).toContain("declared Hugging Face model assets");
    expect(text).not.toContain("sk-");
  });

  it("encodes Phase 4 SVG animation and authored-motion recommendation memos", () => {
    const result = queryProviderCatalog({ capabilityArea: "svg-animation" });
    const byId = new Map(result.providers.map((provider) => [provider.id, provider]));

    expect(result.providers.map((provider) => provider.id)).toEqual([
      "svg.code-native-svg-css-smil",
      "svg.hyperframes",
      "svg.lottie-dotlottie",
      "svg.remotion",
    ]);
    for (const provider of result.providers) {
      expect(provider.recommendationMemo).toBeDefined();
    }
    expect(byId.get("svg.code-native-svg-css-smil")).toMatchObject({
      providerKind: "built-in",
      recommendationTier: "recommended",
      recommendationMemo: {
        deploymentRole: "primary",
        recommendation: expect.stringContaining("standalone, inspectable `.svg`"),
        promotionCriteria: expect.arrayContaining([expect.stringContaining("Browser screenshot")]),
      },
      localArtifactReadiness: {
        status: "local-ready",
      },
    });
    expect(byId.get("svg.lottie-dotlottie")).toMatchObject({
      providerKind: "local",
      recommendationMemo: {
        deploymentRole: "fallback",
        recommendation: expect.stringContaining("Lottie or dotLottie"),
        dogfoodTargets: expect.arrayContaining([expect.stringContaining("Lottie JSON")]),
      },
      localArtifactReadiness: {
        status: "conditional-local",
      },
    });
    expect(byId.get("svg.hyperframes")).toMatchObject({
      sourceModel: "open-source",
      recommendationMemo: {
        deploymentRole: "fallback",
        recommendation: expect.stringContaining("HTML/CSS/JS"),
        promotionCriteria: expect.arrayContaining([expect.stringContaining("Node.js >= 22")]),
      },
      firstPartyTemplate: expect.objectContaining({ templateId: "ambient-cli:ambient-hyperframes" }),
      localArtifactReadiness: {
        minimumLocalSmokeTest: expect.stringContaining("ambient_cli hyperframes_render"),
      },
    });
    expect(byId.get("svg.remotion")).toMatchObject({
      sourceModel: "mixed",
      recommendationMemo: {
        deploymentRole: "fallback",
        recommendation: expect.stringContaining("React/TSX"),
        promotionCriteria: expect.arrayContaining([expect.stringContaining("Licensing/commercial-use")]),
      },
      localArtifactReadiness: {
        missingOrBlockingArtifacts: expect.arrayContaining([expect.stringContaining("license/commercial-use approval")]),
      },
    });
    const text = providerCatalogResultText(result);
    expect(text).toContain("memoRole=primary");
    expect(text).toContain("Lottie / dotLottie");
    expect(text).toContain("HyperFrames by HeyGen");
    expect(text).toContain("Remotion");
  });

  it("encodes Phase 4 image and video generation recommendation memos", () => {
    const image = queryProviderCatalog({ capabilityArea: "image-generation" });
    const imageById = new Map(image.providers.map((provider) => [provider.id, provider]));

    expect(image.providers.map((provider) => provider.id)).toEqual([
      "image.hosted-api-skill-wrapper",
      "image.comfyui-local-workflows",
      "image.fal-model-apis",
      "image.openai-gpt-image",
    ]);
    for (const provider of image.providers) {
      expect(provider.recommendationMemo).toBeDefined();
    }
    expect(imageById.get("image.hosted-api-skill-wrapper")).toMatchObject({
      providerKind: "cloud",
      recommendationTier: "conditional",
      firstPartyTemplate: {
        available: true,
        templateId: "ambient-cli:ambient-imagegen",
      },
      recommendationMemo: {
        deploymentRole: "primary",
        dogfoodTargets: expect.arrayContaining([expect.stringContaining("ambient-imagegen")]),
        promotionCriteria: expect.arrayContaining([expect.stringContaining("OpenAI and Google Nano Banana Pro")]),
      },
      secrets: expect.arrayContaining([
        expect.objectContaining({ envName: "OPENAI_API_KEY", required: false }),
        expect.objectContaining({ envName: "GEMINI_API_KEY", required: false }),
        expect.objectContaining({ envName: "FAL_KEY", required: false }),
      ]),
      localArtifactReadiness: {
        status: "hosted-reference",
      },
    });
    expect(imageById.get("image.openai-gpt-image")).toMatchObject({
      providerKind: "cloud",
      recommendationMemo: {
        deploymentRole: "primary",
        dogfoodTargets: expect.arrayContaining([expect.stringContaining("gpt-image-2")]),
        promotionCriteria: expect.arrayContaining([expect.stringContaining("non-empty output bytes")]),
      },
      secrets: [expect.objectContaining({ envName: "OPENAI_API_KEY" })],
      localArtifactReadiness: {
        status: "hosted-reference",
      },
    });
    expect(imageById.get("image.comfyui-local-workflows")).toMatchObject({
      providerKind: "local",
      recommendationMemo: {
        deploymentRole: "fallback",
        dogfoodTargets: expect.arrayContaining([expect.stringContaining("workflow JSON")]),
      },
      runtimeState: {
        externalService: true,
        serviceKind: "local-daemon",
      },
      localArtifactReadiness: {
        status: "conditional-local",
      },
    });
    expect(imageById.get("image.fal-model-apis")).toMatchObject({
      sourceModel: "mixed",
      recommendationMemo: {
        deploymentRole: "fallback",
        promotionCriteria: expect.arrayContaining([expect.stringContaining("FAL_KEY")]),
      },
      secrets: [expect.objectContaining({ envName: "FAL_KEY" })],
    });
    const imageText = providerCatalogResultText(image);
    expect(imageText).toContain("Ambient hosted image API wrapper");
    expect(imageText).toContain("ambient-imagegen");
    expect(imageText).toContain("Google Nano Banana Pro");
    expect(imageText).toContain("OpenAI GPT Image API");
    expect(imageText).toContain("ComfyUI local image workflows");
    expect(imageText).toContain("fal Model APIs");
    expect(imageText).toContain("memoRole=primary");

    const defaultVideo = queryProviderCatalog({ capabilityArea: "video-generation" });
    const defaultVideoIds = defaultVideo.providers.map((provider) => provider.id);
    expect(defaultVideoIds).toEqual([
      "video.comfyui-local-workflows",
      "video.hyperframes-authored-motion",
      "video.luma-dream-machine-api",
      "video.runway-api",
    ]);
    expect(defaultVideoIds).not.toContain("video.openai-sora-api");

    const video = queryProviderCatalog({ capabilityArea: "video-generation", includeNeedsResearch: true });
    const videoById = new Map(video.providers.map((provider) => [provider.id, provider]));
    expect(videoById.get("video.runway-api")).toMatchObject({
      recommendationMemo: {
        deploymentRole: "primary",
        dogfoodTargets: expect.arrayContaining([expect.stringContaining("poll until completion")]),
      },
      secrets: [expect.objectContaining({ envName: "RUNWAYML_API_SECRET" })],
    });
    expect(videoById.get("video.luma-dream-machine-api")).toMatchObject({
      recommendationMemo: {
        deploymentRole: "fallback",
        promotionCriteria: expect.arrayContaining([expect.stringContaining("LUMA_API_KEY")]),
      },
      secrets: [expect.objectContaining({ envName: "LUMA_API_KEY" })],
    });
    expect(videoById.get("video.comfyui-local-workflows")).toMatchObject({
      recommendationMemo: {
        deploymentRole: "research",
        recommendation: expect.stringContaining("first local/open generative-video research path"),
      },
      localArtifactReadiness: {
        status: "conditional-local",
      },
    });
    expect(videoById.get("video.hyperframes-authored-motion")).toMatchObject({
      recommendationMemo: {
        deploymentRole: "fallback",
        recommendation: expect.stringContaining("ambient-hyperframes Ambient CLI package"),
      },
      firstPartyTemplate: expect.objectContaining({ templateId: "ambient-cli:ambient-hyperframes" }),
      localArtifactReadiness: {
        minimumLocalSmokeTest: expect.stringContaining("ambient_cli hyperframes_render"),
      },
    });
    expect(videoById.get("video.openai-sora-api")).toMatchObject({
      recommendationTier: "research-needed",
      researchStatus: "deprecated",
      recommendationMemo: {
        deploymentRole: "reserved",
        recommendation: expect.stringContaining("September 24, 2026"),
      },
    });
    const videoText = providerCatalogResultText(video);
    expect(videoText).toContain("Runway API");
    expect(videoText).toContain("Luma Dream Machine API");
    expect(videoText).toContain("HyperFrames authored-motion video");
    expect(videoText).toContain("memoRole=reserved");
    expect(videoText).toContain("September 24, 2026");
  });

  it("encodes Phase 4 social-media and agentic-service recommendation memos", () => {
    const defaultSocial = queryProviderCatalog({ capabilityArea: "social-media" });
    expect(defaultSocial.providers.map((provider) => provider.id)).toEqual([
      "social.bluesky-atproto",
      "social.mastodon-api",
      "social.x-api",
    ]);
    expect(defaultSocial.providers.map((provider) => provider.id)).not.toContain("social.linkedin-posts-api");

    const social = queryProviderCatalog({ capabilityArea: "social-media", includeNeedsResearch: true });
    const socialById = new Map(social.providers.map((provider) => [provider.id, provider]));
    for (const provider of social.providers) {
      expect(provider.recommendationMemo).toBeDefined();
    }
    expect(socialById.get("social.bluesky-atproto")).toMatchObject({
      providerKind: "hybrid",
      recommendationMemo: {
        deploymentRole: "primary",
        dogfoodTargets: expect.arrayContaining([expect.stringContaining("URI and CID")]),
        promotionCriteria: expect.arrayContaining([expect.stringContaining("explicit approval")]),
      },
      secrets: [expect.objectContaining({ envName: "BLUESKY_APP_PASSWORD" })],
    });
    expect(socialById.get("social.mastodon-api")).toMatchObject({
      providerKind: "hybrid",
      recommendationMemo: {
        deploymentRole: "fallback",
        dogfoodTargets: expect.arrayContaining([expect.stringContaining("Idempotency-Key")]),
      },
      secrets: [expect.objectContaining({ envName: "MASTODON_ACCESS_TOKEN" })],
    });
    expect(socialById.get("social.x-api")).toMatchObject({
      providerKind: "cloud",
      recommendationMemo: {
        deploymentRole: "reserved",
        promotionCriteria: expect.arrayContaining([expect.stringContaining("official X API endpoints")]),
      },
      secrets: [expect.objectContaining({ envName: "X_USER_ACCESS_TOKEN" })],
    });
    expect(socialById.get("social.linkedin-posts-api")).toMatchObject({
      recommendationTier: "research-needed",
      recommendationMemo: {
        deploymentRole: "reserved",
        recommendation: expect.stringContaining("version-header handling"),
        dogfoodTargets: expect.arrayContaining([expect.stringContaining("Linkedin-Version")]),
      },
      secrets: [expect.objectContaining({ envName: "LINKEDIN_ACCESS_TOKEN" })],
    });
    const socialText = providerCatalogResultText(social);
    expect(socialText).toContain("Bluesky / AT Protocol");
    expect(socialText).toContain("Mastodon API");
    expect(socialText).toContain("X API");
    expect(socialText).toContain("LinkedIn Posts API");
    expect(socialText).toContain("memoRole=reserved");

    const agentic = queryProviderCatalog({ capabilityArea: "agentic-services" });
    expect(agentic.providers.map((provider) => provider.id)).toEqual(["agentic-services.stripe-sandbox"]);
    expect(agentic.providers[0]).toMatchObject({
      providerKind: "cloud",
      recommendationMemo: {
        deploymentRole: "primary",
        recommendation: expect.stringContaining("sandbox-only"),
        dogfoodTargets: expect.arrayContaining([expect.stringContaining("STRIPE_SECRET_KEY")]),
        promotionCriteria: expect.arrayContaining([expect.stringContaining("idempotency key")]),
      },
      secrets: expect.arrayContaining([
        expect.objectContaining({ envName: "STRIPE_SECRET_KEY", required: true }),
        expect.objectContaining({ envName: "STRIPE_WEBHOOK_SECRET", required: false }),
      ]),
      localArtifactReadiness: {
        status: "hosted-reference",
      },
    });
    const agenticText = providerCatalogResultText(agentic);
    expect(agenticText).toContain("Stripe Sandbox");
    expect(agenticText).toContain("memoRole=primary");
    expect(agenticText).toContain("no autonomous money movement");
  });

  it("captures operational quirks for SearXNG and chat-bridging Tailscale", () => {
    const searxng = getProviderCatalogEntries().find((entry) => entry.id === "search.searxng");
    expect(searxng).toMatchObject({
      providerKind: "hybrid",
      runtimeState: {
        externalService: true,
        serviceKind: "docker-compose",
      },
    });
    expect(searxng?.runtimeState?.updatePolicy).toContain("Regularly update");
    expect(searxng?.knownQuirks.join(" ")).toContain("CAPTCHA");

    const tailscale = queryProviderCatalog({ capabilityArea: "chat-bridging", includeNeedsResearch: true }).providers[0];
    expect(tailscale).toMatchObject({
      id: "chat-bridging.tailscale",
      installerShape: "network-integration",
      recommendationTier: "research-needed",
    });
    expect(tailscale.ambientContract.validationTarget).toContain("Later phase");
  });

  it("filters by platform, installer shape, source preference, and goal text", () => {
    const localOpenStt = queryProviderCatalog({
      capabilityArea: "voice-recognition",
      locality: "local",
      sourcePreference: "open-source",
      platform: "macos-arm64",
      installerShape: "stt-provider",
    });

    expect(localOpenStt.providers.map((provider) => provider.id)).toEqual(["stt.qwen-asr", "stt.faster-whisper"]);

    const qwen = queryProviderCatalog({ goal: "Qwen 4B", includeExperimental: true });
    expect(qwen.providers.map((provider) => provider.id)).toEqual(
      expect.arrayContaining(["deep.infoseeker-repro-4b", "deep.openseeker-v1-30b"]),
    );

    const retrieval = queryProviderCatalog({ capabilityArea: "retrieval", includeExperimental: true });
    expect(retrieval.providers.map((provider) => provider.id)).toEqual(
      expect.arrayContaining(["retrieval.reason-moderncolbert", "retrieval.agentir"]),
    );
    expect(retrieval.providers.find((provider) => provider.id === "retrieval.reason-moderncolbert")?.localArtifactReadiness).toMatchObject({
      status: "conditional-local",
      minimumLocalSmokeTest: expect.stringContaining("two-document index"),
    });
  });

  it("encodes Phase 4 voice-recognition and web-scraping recommendation memos", () => {
    const stt = queryProviderCatalog({ capabilityArea: "voice-recognition" });
    expect(stt.providers.map((provider) => provider.id)).toEqual(["stt.qwen-asr", "stt.faster-whisper"]);
    expect(stt.providers[0]).toMatchObject({
      id: "stt.qwen-asr",
      recommendationTier: "recommended",
      researchStatus: "live-dogfooded",
      knownQuirks: expect.arrayContaining([expect.stringContaining("validation=needs-runtime")]),
      recommendationMemo: {
        deploymentRole: "primary",
        recommendation: expect.stringContaining("favored first-party local STT path"),
        fallbackGuidance: expect.arrayContaining([expect.stringContaining("faster-whisper")]),
      },
      evidence: expect.arrayContaining([
        expect.objectContaining({
          type: "local-smoke",
          summary: expect.stringContaining("Phase 5 live Pi dogfood installed the bundled ambient-qwen3-asr"),
        }),
      ]),
    });
    expect(stt.providers[1]).toMatchObject({
      id: "stt.faster-whisper",
      knownQuirks: expect.arrayContaining([
        expect.stringContaining("explicit requests dependency"),
        expect.stringContaining("English-only tiny.en"),
        expect.stringContaining("adapter-only"),
        expect.stringContaining("Linux CUDA clean-cache validation"),
      ]),
      hardwareFit: expect.arrayContaining([expect.stringContaining("Linux CUDA RTX 4090")]),
      recommendationMemo: {
        deploymentRole: "fallback",
        dogfoodTargets: expect.arrayContaining([
          expect.stringContaining("adapter-only install contract"),
          expect.stringContaining("clean-cache validation script"),
        ]),
        promotionCriteria: expect.arrayContaining([expect.stringContaining("status/select/test")]),
      },
      evidence: expect.arrayContaining([
        expect.objectContaining({
          type: "local-smoke",
          summary: expect.stringContaining("Phase 5 local STT smoke ran scripts/stt-spike/providers.faster-whisper-tiny-smoke.json"),
        }),
        expect.objectContaining({
          type: "pi-live-dogfood",
          summary: expect.stringContaining("Phase 5 live Ambient/Pi product-path dogfood installed the bundled ambient-faster-whisper-stt"),
        }),
        expect.objectContaining({
          type: "local-smoke",
          summary: expect.stringContaining("adapter-only distribution"),
        }),
        expect.objectContaining({
          type: "local-smoke",
          summary: expect.stringContaining("clean-cache validation"),
        }),
        expect.objectContaining({
          type: "local-smoke",
          summary: expect.stringContaining("Linux clean-cache validation"),
        }),
      ]),
      docs: expect.arrayContaining([
        expect.objectContaining({
          label: "Ambient faster-whisper STT package",
          url: "resources/ambient-cli-packages/ambient-faster-whisper-stt",
        }),
        expect.objectContaining({
          label: "Ambient faster-whisper STT package instructions",
          url: "resources/ambient-cli-packages/ambient-faster-whisper-stt/SKILL.md",
        }),
        expect.objectContaining({
          label: "faster-whisper clean-cache validation",
          url: "scripts/stt-faster-whisper-clean-cache-validation.mjs",
        }),
      ]),
    });
    expect(providerCatalogResultText(stt)).toContain("memoRole=primary");
    expect(providerCatalogResultText(stt)).toContain("promoteWhen=");
    expect(providerCatalogResultText(stt)).toContain("Linux CUDA RTX 4090");

    const scraping = queryProviderCatalog({ capabilityArea: "web-scraping" });
    expect(scraping.providers.map((provider) => provider.id)).toEqual(["scrape.scrapling", "scrape.lightpanda"]);
    expect(scraping.providers[0]).toMatchObject({
      id: "scrape.scrapling",
      recommendationTier: "recommended",
      researchStatus: "live-dogfooded",
      recommendationMemo: {
        deploymentRole: "primary",
        fallbackGuidance: expect.arrayContaining([expect.stringContaining("Ambient browser/Playwright")]),
      },
    });
    expect(scraping.providers[1]).toMatchObject({
      id: "scrape.lightpanda",
      recommendationMemo: {
        deploymentRole: "research",
        promotionCriteria: expect.arrayContaining([expect.stringContaining("macOS arm64 and Linux x64")]),
      },
    });
    expect(providerCatalogResultText(scraping)).toContain("Real Scrapling dependency warmup");
  });

  it("returns defensive copies rather than mutable catalog references", () => {
    const copy = getProviderCatalogEntries();
    copy[0].bestFor.push("mutated");

    expect(providerCatalogEntries[0].bestFor).not.toContain("mutated");
  });

  it("normalizes and runs the read-only Pi tool payload without provider side effects", () => {
    expect(providerCatalogToolInput({
      capabilityArea: "web-search",
      includeNeedsResearch: true,
      limit: 2.8,
    })).toEqual({
      capabilityArea: "web-search",
      includeNeedsResearch: true,
      limit: 2,
    });
    expect(() => providerCatalogToolInput({ capabilityArea: "unknown" })).toThrow(/capabilityArea must be one of/);

    const result = runProviderCatalogTool(
      { capabilityArea: "chat-bridging", includeNeedsResearch: true },
      new Date("2026-05-11T00:00:00.000Z"),
    );

    expect(result.content[0].text).toContain("Tailscale");
    expect(result.details).toMatchObject({
      runtime: "ambient-provider-catalog",
      toolName: "ambient_provider_catalog",
      status: "complete",
      providerCount: 1,
    });
    expect(result.details.providers[0]).toMatchObject({
      id: "chat-bridging.tailscale",
      secrets: [],
    });
  });
});
