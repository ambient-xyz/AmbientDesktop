export const AMBIENT_SUBAGENTS_FEATURE_FLAG = "ambient.subagents" as const;
export const AMBIENT_TENCENTDB_MEMORY_FEATURE_FLAG = "ambient.memory.tencentdb" as const;
export const AMBIENT_SLASH_COMMANDS_FEATURE_FLAG = "ambient.slashCommands" as const;

export const AMBIENT_FEATURE_FLAG_IDS = [
  AMBIENT_SUBAGENTS_FEATURE_FLAG,
  AMBIENT_TENCENTDB_MEMORY_FEATURE_FLAG,
  AMBIENT_SLASH_COMMANDS_FEATURE_FLAG,
] as const;

export type AmbientFeatureFlagId = typeof AMBIENT_FEATURE_FLAG_IDS[number];

export interface AmbientFeatureFlagSettings {
  subagents: boolean;
  tencentDbMemory: boolean;
  slashCommands: boolean;
}

export interface UpdateFeatureFlagSettingsInput {
  subagents?: boolean;
  tencentDbMemory?: boolean;
  slashCommands?: boolean;
}

export type AmbientFeatureFlagOverrideSource = "startup_arg" | "harness";

export interface AmbientFeatureFlagOverrides {
  enabled?: AmbientFeatureFlagId[];
  disabled?: AmbientFeatureFlagId[];
  source: AmbientFeatureFlagOverrideSource;
}

export type AmbientFeatureFlagResolvedSource =
  | "default"
  | "settings"
  | "startup_arg_enable"
  | "startup_arg_disable"
  | "harness_enable"
  | "harness_disable";

export interface AmbientFeatureFlagResolution {
  id: AmbientFeatureFlagId;
  enabled: boolean;
  source: AmbientFeatureFlagResolvedSource;
  defaultEnabled: boolean;
  settingsEnabled?: boolean;
}

export interface AmbientFeatureFlagSnapshot {
  schemaVersion: "ambient-feature-flags-v1";
  generatedAt: string;
  flags: Record<AmbientFeatureFlagId, AmbientFeatureFlagResolution>;
}

export interface ParsedAmbientFeatureFlagLaunchArgs {
  enabled: AmbientFeatureFlagId[];
  disabled: AmbientFeatureFlagId[];
  ignored: string[];
}

export const DEFAULT_AMBIENT_FEATURE_FLAG_SETTINGS: AmbientFeatureFlagSettings = {
  subagents: false,
  tencentDbMemory: false,
  slashCommands: false,
};

const AMBIENT_FEATURE_FLAG_DEFAULTS: Record<AmbientFeatureFlagId, boolean> = {
  [AMBIENT_SUBAGENTS_FEATURE_FLAG]: false,
  [AMBIENT_TENCENTDB_MEMORY_FEATURE_FLAG]: false,
  [AMBIENT_SLASH_COMMANDS_FEATURE_FLAG]: false,
};

function isAmbientFeatureFlagId(value: string): value is AmbientFeatureFlagId {
  return AMBIENT_FEATURE_FLAG_IDS.includes(value as AmbientFeatureFlagId);
}

function featureFlagIdFromSettingKey(key: keyof AmbientFeatureFlagSettings): AmbientFeatureFlagId {
  if (key === "subagents") return AMBIENT_SUBAGENTS_FEATURE_FLAG;
  if (key === "tencentDbMemory") return AMBIENT_TENCENTDB_MEMORY_FEATURE_FLAG;
  if (key === "slashCommands") return AMBIENT_SLASH_COMMANDS_FEATURE_FLAG;
  throw new Error(`Unsupported feature flag setting key: ${key}`);
}

function settingKeyFromFeatureFlagId(id: AmbientFeatureFlagId): keyof AmbientFeatureFlagSettings {
  if (id === AMBIENT_SUBAGENTS_FEATURE_FLAG) return "subagents";
  if (id === AMBIENT_TENCENTDB_MEMORY_FEATURE_FLAG) return "tencentDbMemory";
  if (id === AMBIENT_SLASH_COMMANDS_FEATURE_FLAG) return "slashCommands";
  throw new Error(`Unsupported feature flag id: ${id}`);
}

export function normalizeAmbientFeatureFlagSettings(input?: Partial<AmbientFeatureFlagSettings> | null): AmbientFeatureFlagSettings {
  return {
    subagents: typeof input?.subagents === "boolean" ? input.subagents : DEFAULT_AMBIENT_FEATURE_FLAG_SETTINGS.subagents,
    tencentDbMemory: typeof input?.tencentDbMemory === "boolean"
      ? input.tencentDbMemory
      : DEFAULT_AMBIENT_FEATURE_FLAG_SETTINGS.tencentDbMemory,
    slashCommands: typeof input?.slashCommands === "boolean"
      ? input.slashCommands
      : DEFAULT_AMBIENT_FEATURE_FLAG_SETTINGS.slashCommands,
  };
}

export function applyAmbientFeatureFlagSettingsPatch(
  current: AmbientFeatureFlagSettings,
  patch: UpdateFeatureFlagSettingsInput,
): AmbientFeatureFlagSettings {
  return normalizeAmbientFeatureFlagSettings({
    ...current,
    ...(typeof patch.subagents === "boolean" ? { subagents: patch.subagents } : {}),
    ...(typeof patch.tencentDbMemory === "boolean" ? { tencentDbMemory: patch.tencentDbMemory } : {}),
    ...(typeof patch.slashCommands === "boolean" ? { slashCommands: patch.slashCommands } : {}),
  });
}

export function parseAmbientFeatureFlagLaunchArgs(args: readonly string[]): ParsedAmbientFeatureFlagLaunchArgs {
  const enabled = new Set<AmbientFeatureFlagId>();
  const disabled = new Set<AmbientFeatureFlagId>();
  const ignored = new Set<string>();

  const readFlagList = (value: string | undefined): string[] => (value ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index] ?? "";
    const enablePrefix = "--enable-feature=";
    const disablePrefix = "--disable-feature=";
    let mode: "enable" | "disable" | undefined;
    let rawValue: string | undefined;

    if (arg.startsWith(enablePrefix)) {
      mode = "enable";
      rawValue = arg.slice(enablePrefix.length);
    } else if (arg.startsWith(disablePrefix)) {
      mode = "disable";
      rawValue = arg.slice(disablePrefix.length);
    } else if (arg === "--enable-feature" || arg === "--disable-feature") {
      mode = arg === "--enable-feature" ? "enable" : "disable";
      rawValue = args[index + 1];
      index += 1;
    }

    if (!mode) continue;

    for (const candidate of readFlagList(rawValue)) {
      if (!isAmbientFeatureFlagId(candidate)) {
        ignored.add(candidate);
        continue;
      }
      if (mode === "enable") enabled.add(candidate);
      else disabled.add(candidate);
    }
  }

  return {
    enabled: [...enabled],
    disabled: [...disabled],
    ignored: [...ignored],
  };
}

export interface ResolveAmbientFeatureFlagsInput {
  settings?: Partial<AmbientFeatureFlagSettings> | null;
  startup?: Pick<ParsedAmbientFeatureFlagLaunchArgs, "enabled" | "disabled">;
  harness?: Pick<ParsedAmbientFeatureFlagLaunchArgs, "enabled" | "disabled">;
  generatedAt?: string;
}

export function resolveAmbientFeatureFlags(input: ResolveAmbientFeatureFlagsInput = {}): AmbientFeatureFlagSnapshot {
  const settings = normalizeAmbientFeatureFlagSettings(input.settings);
  const startupEnabled = new Set(input.startup?.enabled ?? []);
  const startupDisabled = new Set(input.startup?.disabled ?? []);
  const harnessEnabled = new Set(input.harness?.enabled ?? []);
  const harnessDisabled = new Set(input.harness?.disabled ?? []);
  const flags = {} as Record<AmbientFeatureFlagId, AmbientFeatureFlagResolution>;

  for (const id of AMBIENT_FEATURE_FLAG_IDS) {
    const settingsEnabled = settings[settingKeyFromFeatureFlagId(id)];
    let enabled = AMBIENT_FEATURE_FLAG_DEFAULTS[id];
    let source: AmbientFeatureFlagResolvedSource = "default";

    if (settingsEnabled !== AMBIENT_FEATURE_FLAG_DEFAULTS[id]) {
      enabled = settingsEnabled;
      source = "settings";
    }
    if (startupEnabled.has(id)) {
      enabled = true;
      source = "startup_arg_enable";
    }
    if (harnessEnabled.has(id)) {
      enabled = true;
      source = "harness_enable";
    }
    if (harnessDisabled.has(id)) {
      enabled = false;
      source = "harness_disable";
    }
    if (startupDisabled.has(id)) {
      enabled = false;
      source = "startup_arg_disable";
    }

    flags[id] = {
      id,
      enabled,
      source,
      defaultEnabled: AMBIENT_FEATURE_FLAG_DEFAULTS[id],
      settingsEnabled,
    };
  }

  return {
    schemaVersion: "ambient-feature-flags-v1",
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    flags,
  };
}

export function isAmbientSubagentsEnabled(snapshot: AmbientFeatureFlagSnapshot): boolean {
  return snapshot.flags[AMBIENT_SUBAGENTS_FEATURE_FLAG].enabled;
}

export function isAmbientTencentDbMemoryEnabled(snapshot: AmbientFeatureFlagSnapshot): boolean {
  return snapshot.flags[AMBIENT_TENCENTDB_MEMORY_FEATURE_FLAG].enabled;
}

export function isAmbientSlashCommandsEnabled(snapshot: AmbientFeatureFlagSnapshot): boolean {
  return snapshot.flags[AMBIENT_SLASH_COMMANDS_FEATURE_FLAG].enabled;
}

export function ambientFeatureFlagSettingKey(id: AmbientFeatureFlagId): keyof AmbientFeatureFlagSettings {
  return settingKeyFromFeatureFlagId(id);
}

export function ambientFeatureFlagIdForSettingKey(key: keyof AmbientFeatureFlagSettings): AmbientFeatureFlagId {
  return featureFlagIdFromSettingKey(key);
}
