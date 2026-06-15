import type Database from "better-sqlite3";
import type { AmbientModelRuntimeCatalog } from "../shared/ambientModels";
import {
  AMBIENT_DEFAULT_MODEL,
  normalizeAmbientModelId,
} from "../shared/ambientModels";
import {
  applyAmbientFeatureFlagSettingsPatch,
  DEFAULT_AMBIENT_FEATURE_FLAG_SETTINGS,
  normalizeAmbientFeatureFlagSettings,
  type AmbientFeatureFlagSettings,
  type UpdateFeatureFlagSettingsInput,
} from "../shared/featureFlags";
import {
  applyAgentMemorySettingsPatch,
  DEFAULT_AGENT_MEMORY_SETTINGS,
  normalizeAgentMemorySettings,
  type AgentMemorySettings,
  type UpdateAgentMemorySettingsInput,
} from "../shared/agentMemorySettings";
import {
  DEFAULT_MODEL_RUNTIME_SETTINGS,
  modelRuntimeProfilesFromSettings,
  modelRuntimeProvidersFromSettings,
  normalizeModelRuntimeSettings,
} from "../shared/modelRuntimeSettings";
import type {
  AmbientCompactionSettings,
  CollaborationMode,
  DesktopSettings,
  ModelRuntimeSettings,
  PermissionMode,
  ThinkingLevel,
} from "../shared/types";
import { defaultLocalDeepResearchSettings } from "./localDeepResearchProviderStack";
import { createModelRuntimeCatalog } from "./modelRuntimeRegistry";
import { migrateProjectStorePermissionModeDefaultsToWorkspace } from "./projectStoreSchema";
import { DEFAULT_COMPACTION_SETTINGS, normalizeCompactionSettings } from "./projectStoreSettings";

export class ProjectStoreSettingsRepository {
  constructor(private readonly db: Database.Database) {}

  ensureDefaultSettings(): void {
    const defaults: Record<string, unknown> = {
      permissionMode: "workspace",
      model: AMBIENT_DEFAULT_MODEL,
      thinkingLevel: "xhigh",
      memory: DEFAULT_AGENT_MEMORY_SETTINGS,
      modelRuntime: DEFAULT_MODEL_RUNTIME_SETTINGS,
      automationAutoDispatchEnabled: true,
    };
    for (const [key, value] of Object.entries(defaults)) {
      this.db
        .prepare("INSERT OR IGNORE INTO settings (key, value_json) VALUES (?, ?)")
        .run(key, JSON.stringify(value));
    }
    migrateProjectStorePermissionModeDefaultsToWorkspace(this.db);
  }

  getDefaultSettings(): DesktopSettings {
    return {
      permissionMode: this.getSetting("permissionMode", "workspace") as PermissionMode,
      collaborationMode: this.getSetting("collaborationMode", "agent") as CollaborationMode,
      model: normalizeAmbientModelId(this.getSetting("model", AMBIENT_DEFAULT_MODEL) as string),
      featureFlags: this.getFeatureFlagSettings(),
      memory: this.getMemorySettings(),
      thinkingLevel: this.getSetting("thinkingLevel", "xhigh") as ThinkingLevel,
      thinkingDisplay: { mode: "transient", showRunStatusCard: false },
      modelRuntime: this.getModelRuntimeSettings(),
      modelCatalog: this.getModelRuntimeCatalog(),
      compaction: this.getCompactionSettings(),
      media: { generatedMediaAutoplay: false },
      planner: { autoFinalize: true },
      search: {},
      localDeepResearch: defaultLocalDeepResearchSettings(),
      voice: {
        enabled: false,
        mode: "assistant-final",
        autoplay: false,
        maxChars: 1500,
        longReply: "summarize",
        format: "mp3",
        artifactCacheMaxMb: 30,
      },
      stt: {
        enabled: false,
        spokenLanguage: "English",
        microphone: {},
        mode: "push-to-talk",
        autoSendAfterTranscription: true,
        silenceFinalizeSeconds: 0.8,
        noSpeechGate: {
          enabled: true,
          rmsThresholdDbfs: -55,
        },
        bargeIn: {
          stopTtsOnSpeech: true,
          queueWhileAgentRuns: true,
        },
      },
    };
  }

  getCompactionSettings(): AmbientCompactionSettings {
    return normalizeCompactionSettings(this.getSetting("compaction", DEFAULT_COMPACTION_SETTINGS));
  }

  setCompactionSettings(input: Partial<AmbientCompactionSettings>): AmbientCompactionSettings {
    const next = normalizeCompactionSettings({ ...this.getCompactionSettings(), ...input });
    this.setSetting("compaction", next);
    return next;
  }

  getModelRuntimeSettings(): ModelRuntimeSettings {
    return normalizeModelRuntimeSettings(this.getSetting("modelRuntime", DEFAULT_MODEL_RUNTIME_SETTINGS));
  }

  setModelRuntimeSettings(input: Partial<ModelRuntimeSettings>): ModelRuntimeSettings {
    const next = normalizeModelRuntimeSettings({ ...this.getModelRuntimeSettings(), ...input });
    this.setSetting("modelRuntime", next);
    return next;
  }

  getModelRuntimeCatalog(generatedAt?: string, runtimeProfiles: readonly AmbientModelRuntimeCatalog["profiles"][number][] = []): AmbientModelRuntimeCatalog {
    const settings = this.getModelRuntimeSettings();
    return createModelRuntimeCatalog({
      generatedAt,
      providers: modelRuntimeProvidersFromSettings(settings),
      runtimeProfiles: [
        ...modelRuntimeProfilesFromSettings(settings),
        ...runtimeProfiles,
      ],
    });
  }

  getFeatureFlagSettings(): AmbientFeatureFlagSettings {
    return normalizeAmbientFeatureFlagSettings(
      this.getSetting("featureFlags", DEFAULT_AMBIENT_FEATURE_FLAG_SETTINGS) as Partial<AmbientFeatureFlagSettings>,
    );
  }

  setFeatureFlagSettings(input: UpdateFeatureFlagSettingsInput): AmbientFeatureFlagSettings {
    const next = applyAmbientFeatureFlagSettingsPatch(this.getFeatureFlagSettings(), input);
    this.setSetting("featureFlags", next);
    return next;
  }

  getMemorySettings(): AgentMemorySettings {
    return normalizeAgentMemorySettings(
      this.getSetting("memory", DEFAULT_AGENT_MEMORY_SETTINGS) as Partial<AgentMemorySettings>,
    );
  }

  setMemorySettings(input: UpdateAgentMemorySettingsInput): AgentMemorySettings {
    const next = applyAgentMemorySettingsPatch(this.getMemorySettings(), input);
    this.setSetting("memory", next);
    return next;
  }

  getAutomationAutoDispatchEnabled(): boolean {
    const value = this.getSetting("automationAutoDispatchEnabled", true);
    return typeof value === "boolean" ? value : true;
  }

  setAutomationAutoDispatchEnabled(enabled: boolean): void {
    this.setSetting("automationAutoDispatchEnabled", enabled);
  }

  getSetting(key: string, fallback: unknown): unknown {
    const row = this.db.prepare("SELECT value_json FROM settings WHERE key = ?").get(key) as
      | { value_json: string }
      | undefined;
    if (!row) return fallback;
    try {
      return JSON.parse(row.value_json);
    } catch {
      return fallback;
    }
  }

  setSetting(key: string, value: unknown): void {
    this.db
      .prepare(
        `INSERT INTO settings (key, value_json)
         VALUES (?, ?)
         ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json`,
      )
      .run(key, JSON.stringify(value));
  }
}
