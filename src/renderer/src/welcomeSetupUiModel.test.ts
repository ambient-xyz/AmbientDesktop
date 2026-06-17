import { describe, expect, it } from "vitest";
import { welcomeOnboardingMessageMetadata } from "../../shared/welcomeOnboarding";
import type { ChatMessage, ProviderCatalogSettingsCard } from "../../shared/types";
import {
  welcomeCoreSetupSectionDefinitions,
  welcomeCoreSetupSections,
  welcomeCoreSetupUncoveredCards,
  welcomeOnboardingPageKindForMessages,
  welcomeOnboardingPageShouldOpenAtTop,
} from "./welcomeSetupUiModel";

function card(id: string, capabilityArea: string): ProviderCatalogSettingsCard {
  return {
    id,
    displayName: id,
    capabilityArea,
    providerKind: "local",
    sourceModel: "open-source",
    recommendationTier: "recommended",
    recommendationSummary: `${id} summary`,
    bestFor: [],
    tradeoffs: [],
    avoidWhen: [],
    platforms: [],
    hardwareFit: [],
    ambientContract: {
      descriptorRequirements: [],
      artifactPolicy: "preserve artifacts",
      validationTarget: "smoke test",
    },
    secrets: [],
    networkHosts: [],
    modelAssets: [],
    costPrivacyNotes: [],
    maintenanceNotes: [],
    safetyBoundaries: [],
    knownQuirks: [],
    researchStatus: "reviewed",
    docs: [],
  };
}

function message(metadata: Record<string, unknown>): Pick<ChatMessage, "metadata"> {
  return { metadata };
}

describe("welcome setup UI model", () => {
  it("covers every current provider catalog setup area in a Core Setup section", () => {
    const currentAreas = [
      "voice-generation",
      "voice-recognition",
      "web-search",
      "web-scraping",
      "retrieval",
      "deep-research",
      "visual-understanding",
      "image-generation",
      "video-generation",
      "rich-documents",
      "writing-style-transfer",
      "svg-animation",
      "social-media",
      "agentic-services",
      "chat-bridging",
    ];
    const cards = currentAreas.map((area) => card(area, area));

    expect(welcomeCoreSetupUncoveredCards(cards)).toEqual([]);
    expect(new Set(welcomeCoreSetupSectionDefinitions.flatMap((section) => section.capabilityAreas))).toEqual(new Set(currentAreas));
  });

  it("groups cards into stable Core Setup sections", () => {
    const sections = welcomeCoreSetupSections([
      card("voice.piper", "voice-generation"),
      card("search.brave", "web-search"),
      card("deep.literesearcher", "deep-research"),
      card("writing.tinystyler", "writing-style-transfer"),
    ]);

    expect(sections.find((section) => section.id === "voice-output")?.cards.map((item) => item.id)).toEqual(["voice.piper"]);
    expect(sections.find((section) => section.id === "search-web-research")?.cards.map((item) => item.id)).toEqual([
      "search.brave",
      "deep.literesearcher",
    ]);
    expect(sections.find((section) => section.id === "writing-style")?.cards.map((item) => item.id)).toEqual(["writing.tinystyler"]);
  });

  it("identifies Welcome seeded pages for top-open behavior without changing ordinary chats", () => {
    expect(welcomeOnboardingPageKindForMessages([message(welcomeOnboardingMessageMetadata("core_setup"))])).toBe("core_setup");
    expect(welcomeOnboardingPageShouldOpenAtTop("plugin_setup")).toBe(true);
    expect(welcomeOnboardingPageShouldOpenAtTop(undefined)).toBe(false);
    expect(welcomeOnboardingPageKindForMessages([message({ kind: "user-note" })])).toBeUndefined();
  });
});
