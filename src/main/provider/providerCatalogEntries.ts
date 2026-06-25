import type { ProviderCatalogEntry } from "./providerCatalogTypes";
import { providerCatalogVoiceEntries } from "./providerCatalogVoiceEntries";
import { providerCatalogSpeechEntries } from "./providerCatalogSpeechEntries";
import { providerCatalogWebDiscoveryEntries } from "./providerCatalogWebDiscoveryEntries";
import { providerCatalogDeepResearchEntries } from "./providerCatalogDeepResearchEntries";
import { providerCatalogVisionEntries } from "./providerCatalogVisionEntries";
import { providerCatalogImageEntries } from "./providerCatalogImageEntries";
import { providerCatalogVideoEntries } from "./providerCatalogVideoEntries";
import { providerCatalogRichDocumentEntries } from "./providerCatalogRichDocumentEntries";
import { providerCatalogWritingSvgEntries } from "./providerCatalogWritingSvgEntries";
import { providerCatalogSocialAgenticEntries } from "./providerCatalogSocialAgenticEntries";

export const providerCatalogEntries: ProviderCatalogEntry[] = [
  ...providerCatalogVoiceEntries,
  ...providerCatalogSpeechEntries,
  ...providerCatalogWebDiscoveryEntries,
  ...providerCatalogDeepResearchEntries,
  ...providerCatalogVisionEntries,
  ...providerCatalogImageEntries,
  ...providerCatalogVideoEntries,
  ...providerCatalogRichDocumentEntries,
  ...providerCatalogWritingSvgEntries,
  ...providerCatalogSocialAgenticEntries,
];
