import type { ChatMessage, ProviderCatalogSettingsCard } from "../../shared/types";
import { welcomeOnboardingPageKindFromMetadata, type WelcomeOnboardingPageKind } from "../../shared/welcomeOnboarding";

export interface WelcomeSetupSectionDefinition {
  id: string;
  title: string;
  summary: string;
  capabilityAreas: string[];
}

export interface WelcomeSetupSection extends WelcomeSetupSectionDefinition {
  cards: ProviderCatalogSettingsCard[];
}

export const welcomeCoreSetupSectionDefinitions: WelcomeSetupSectionDefinition[] = [
  {
    id: "voice-output",
    title: "Voice Output",
    summary: "Assistant read-aloud and TTS providers.",
    capabilityAreas: ["voice-generation"],
  },
  {
    id: "speech-input",
    title: "Speech Input",
    summary: "Microphone and audio-file transcription providers.",
    capabilityAreas: ["voice-recognition"],
  },
  {
    id: "search-web-research",
    title: "Search, Web, and Research",
    summary: "Search providers, scraping, retrieval, and deep research.",
    capabilityAreas: ["web-search", "web-scraping", "retrieval", "deep-research"],
  },
  {
    id: "media-vision",
    title: "Media and Vision",
    summary: "Visual understanding, image generation, video generation, and SVG animation.",
    capabilityAreas: ["visual-understanding", "image-generation", "video-generation", "svg-animation"],
  },
  {
    id: "documents-office",
    title: "Documents and Office",
    summary: "Rich document parsing, previews, and office-document capability surfaces.",
    capabilityAreas: ["rich-documents"],
  },
  {
    id: "writing-style",
    title: "Writing Style",
    summary: "Reusable style profiles and local writing-style transfer packages.",
    capabilityAreas: ["writing-style-transfer"],
  },
  {
    id: "advanced-services",
    title: "Advanced Services",
    summary: "Social, agentic, and chat-bridging setup cards that are product-level rather than custom plugins.",
    capabilityAreas: ["social-media", "agentic-services", "chat-bridging"],
  },
];

export function welcomeCoreSetupSections(cards: readonly ProviderCatalogSettingsCard[]): WelcomeSetupSection[] {
  return welcomeCoreSetupSectionDefinitions.map((definition) => ({
    ...definition,
    cards: cards.filter((card) => definition.capabilityAreas.includes(card.capabilityArea)),
  }));
}

export function welcomeCoreSetupUncoveredCards(cards: readonly ProviderCatalogSettingsCard[]): ProviderCatalogSettingsCard[] {
  const coveredAreas = new Set(welcomeCoreSetupSectionDefinitions.flatMap((definition) => definition.capabilityAreas));
  return cards.filter((card) => !coveredAreas.has(card.capabilityArea));
}

export function welcomeOnboardingPageKindForMessages(messages: readonly Pick<ChatMessage, "metadata">[]): WelcomeOnboardingPageKind | undefined {
  for (const message of messages) {
    const pageKind = welcomeOnboardingPageKindFromMetadata(message.metadata);
    if (pageKind) return pageKind;
  }
  return undefined;
}

export function welcomeOnboardingPageShouldOpenAtTop(pageKind: WelcomeOnboardingPageKind | undefined): boolean {
  return Boolean(pageKind);
}
