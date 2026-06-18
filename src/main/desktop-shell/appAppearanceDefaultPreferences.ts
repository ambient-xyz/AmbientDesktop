import { normalizeLocalDeepResearchSettings } from "../local-deep-research/localDeepResearchProviderStack";
import { normalizeSearchRoutingSettingsWithWebResearch } from "../web-research/webResearchProviderStack";
import { createAppAppearanceProviderPreferences } from "./appAppearance";

export {
  appearanceBackgroundColor,
  createAppAppearanceProviderPreferences,
  DEFAULT_MEDIA_PLAYBACK_SETTINGS,
  DEFAULT_PLANNER_SETTINGS,
  DEFAULT_STT_SETTINGS,
  DEFAULT_THEME_PREFERENCE,
  DEFAULT_THINKING_DISPLAY_SETTINGS,
  DEFAULT_VOICE_SETTINGS,
  isThemePreference,
  normalizeMediaPlaybackSettings,
  normalizePlannerSettings,
  normalizeSttSettings,
  normalizeThinkingDisplaySettings,
  normalizeThemePreference,
  normalizeVoiceSettings,
  readMediaPlaybackSettings,
  readPlannerSettings,
  readSttSettings,
  readThemePreference,
  readThinkingDisplaySettings,
  readVoiceSettings,
  resolveAppearance,
  writeMediaPlaybackSettings,
  writePlannerSettings,
  writeSttSettings,
  writeThemePreference,
  writeThinkingDisplaySettings,
  writeVoiceSettings,
  type AppAppearanceProviderPreferenceNormalizers,
  type AppAppearanceProviderPreferences,
} from "./appAppearance";

const providerPreferences = createAppAppearanceProviderPreferences({
  defaultSearchRoutingSettings: {
    webResearch: normalizeSearchRoutingSettingsWithWebResearch(undefined).webResearch,
  },
  defaultLocalDeepResearchSettings: normalizeLocalDeepResearchSettings(undefined),
  normalizeSearchRoutingSettings: normalizeSearchRoutingSettingsWithWebResearch,
  normalizeLocalDeepResearchSettings,
});

export const DEFAULT_SEARCH_ROUTING_SETTINGS = providerPreferences.DEFAULT_SEARCH_ROUTING_SETTINGS;
export const DEFAULT_LOCAL_DEEP_RESEARCH_SETTINGS = providerPreferences.DEFAULT_LOCAL_DEEP_RESEARCH_SETTINGS;
export const normalizeSearchRoutingSettings = providerPreferences.normalizeSearchRoutingSettings;
export const normalizeLocalDeepResearchAppSettings = providerPreferences.normalizeLocalDeepResearchAppSettings;
export const readSearchRoutingSettings = providerPreferences.readSearchRoutingSettings;
export const readLocalDeepResearchSettings = providerPreferences.readLocalDeepResearchSettings;
export const writeSearchRoutingSettings = providerPreferences.writeSearchRoutingSettings;
export const writeLocalDeepResearchSettings = providerPreferences.writeLocalDeepResearchSettings;
