export interface ProviderStackProviderConfig<Role extends string, Kind extends string = string, Status extends string = "enabled" | "disabled"> {
  providerId: string;
  label: string;
  kind: Kind;
  roles: Role[];
  status: Status;
  privacyLabel?: string;
  optionalSecretRefs?: string[];
}

export interface ProviderStackSettings<SchemaVersion extends string, Role extends string, Provider extends ProviderStackProviderConfig<Role>> {
  schemaVersion: SchemaVersion;
  providers: Provider[];
  preferences: Partial<Record<Role, string[]>>;
  updatedAt?: string;
}

export interface ProviderStackDefinition<SchemaVersion extends string, Role extends string, Provider extends ProviderStackProviderConfig<Role>> {
  schemaVersion: SchemaVersion;
  roles: readonly Role[];
  defaultProviders: readonly Provider[];
  defaultPreferences: Record<Role, string[]>;
  cloneProvider: (provider: Provider) => Provider;
  normalizeCustomProvider: (value: unknown) => Provider | undefined;
  normalizeDefaultProvider?: (provider: Provider, override: Record<string, unknown> | undefined) => Provider;
}

export interface NormalizeProviderStackSettingsOptions<Provider> {
  additionalProviders?: Provider[];
}

export interface ProviderStackRequestPlan<Provider extends ProviderStackProviderConfig<Role>, Role extends string> {
  providers: Provider[];
  providerOrder: string[];
  skippedProviders: Array<{
    providerId: string;
    reason: string;
  }>;
}

export interface ProviderStackRuntimeSummary<Role extends string, Provider extends ProviderStackProviderConfig<Role>> {
  providerId: string;
  label: string;
  role: Role;
  kind: Provider["kind"];
  configuredStatus: Provider["status"];
  availability: "available" | "unavailable" | "disabled" | "unknown";
  reason?: string;
  privacyLabel?: string;
}

export interface ProviderStackStatus<SchemaVersion extends string, Role extends string, Provider extends ProviderStackProviderConfig<Role>> {
  schemaVersion: SchemaVersion;
  settings: ProviderStackSettings<string, Role, Provider>;
  roles: Array<{
    role: Role;
    providers: ProviderStackRuntimeSummary<Role, Provider>[];
  }>;
}

export function defaultProviderStackSettings<SchemaVersion extends string, Role extends string, Provider extends ProviderStackProviderConfig<Role>>(
  definition: ProviderStackDefinition<SchemaVersion, Role, Provider>,
): ProviderStackSettings<SchemaVersion, Role, Provider> {
  return {
    schemaVersion: definition.schemaVersion,
    providers: definition.defaultProviders.map(definition.cloneProvider),
    preferences: cloneProviderStackPreferences(definition.defaultPreferences),
  };
}

export function normalizeProviderStackSettings<SchemaVersion extends string, Role extends string, Provider extends ProviderStackProviderConfig<Role>>(
  value: unknown,
  definition: ProviderStackDefinition<SchemaVersion, Role, Provider>,
  options: NormalizeProviderStackSettingsOptions<Provider> = {},
): ProviderStackSettings<SchemaVersion, Role, Provider> {
  const record = objectRecord(value);
  const providerEntries = Array.isArray(record.providers) ? record.providers : [];
  const defaultProviderIds = new Set(definition.defaultProviders.map((provider) => provider.providerId));
  const providers = definition.defaultProviders.map((provider) => {
    const override = providerEntries
      .map((entry) => objectRecord(entry))
      .find((entry) => entry.providerId === provider.providerId);
    return definition.normalizeDefaultProvider
      ? definition.normalizeDefaultProvider(provider, override)
      : defaultProviderOverride(provider, override, definition.cloneProvider);
  });
  const seen = new Set(providers.map((provider) => provider.providerId));
  for (const entry of providerEntries) {
    const normalized = definition.normalizeCustomProvider(entry);
    if (!normalized || defaultProviderIds.has(normalized.providerId) || seen.has(normalized.providerId)) continue;
    providers.push(normalized);
    seen.add(normalized.providerId);
  }
  for (const provider of options.additionalProviders ?? []) {
    if (seen.has(provider.providerId)) continue;
    providers.push(definition.cloneProvider(provider));
    seen.add(provider.providerId);
  }
  const providerMap = new Map(providers.map((provider) => [provider.providerId, provider]));
  const updatedAt = typeof record.updatedAt === "string" && record.updatedAt.trim() ? record.updatedAt.trim() : undefined;
  return {
    schemaVersion: definition.schemaVersion,
    providers,
    preferences: normalizeProviderStackPreferences(record.preferences, providerMap, definition),
    ...(updatedAt ? { updatedAt } : {}),
  };
}

export function normalizeProviderStackPreferences<Role extends string, Provider extends ProviderStackProviderConfig<Role>>(
  value: unknown,
  providers: Map<string, Provider>,
  definition: Pick<ProviderStackDefinition<string, Role, Provider>, "roles" | "defaultPreferences">,
): Partial<Record<Role, string[]>> {
  const record = objectRecord(value);
  const preferences: Partial<Record<Role, string[]>> = {};
  for (const role of definition.roles) {
    preferences[role] = normalizeProviderStackOrder(record[role], role, providers, definition.defaultPreferences);
  }
  return preferences;
}

export function normalizeProviderStackOrder<Role extends string, Provider extends ProviderStackProviderConfig<Role>>(
  value: unknown,
  role: Role,
  providers: Map<string, Provider>,
  defaultPreferences: Record<Role, string[]>,
): string[] {
  const requested = Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string" && Boolean(entry.trim())).map((entry) => entry.trim())
    : [];
  const seen = new Set<string>();
  const valid = requested.filter((providerId) => {
    if (seen.has(providerId)) return false;
    seen.add(providerId);
    return providers.get(providerId)?.roles.includes(role);
  });
  for (const providerId of defaultPreferences[role]) {
    if (!seen.has(providerId) && providers.get(providerId)?.roles.includes(role)) valid.push(providerId);
  }
  return valid;
}

export function planProviderStackOrder<SchemaVersion extends string, Role extends string, Provider extends ProviderStackProviderConfig<Role>>(
  input: {
    stack: ProviderStackSettings<SchemaVersion, Role, Provider>;
    role: NoInfer<Role>;
    providerOrder?: unknown;
    defaultPreferences: Record<Role, string[]>;
    unknownProviderReason: string;
    disabledProviderReason: string;
    unsupportedRoleReason?: (provider: Provider, role: NoInfer<Role>) => string;
    blockedProviderReason?: (provider: Provider, role: NoInfer<Role>, stack: ProviderStackSettings<SchemaVersion, Role, Provider>) => string | undefined;
  },
): ProviderStackRequestPlan<Provider, Role> {
  const providerMap = new Map(input.stack.providers.map((provider) => [provider.providerId, provider]));
  const override = Array.isArray(input.providerOrder)
    ? input.providerOrder.filter((entry): entry is string => typeof entry === "string" && Boolean(entry.trim())).map((entry) => entry.trim())
    : [];
  const requestedOrder = override.length > 0 ? override : (input.stack.preferences[input.role] ?? input.defaultPreferences[input.role]);
  const seen = new Set<string>();
  const providerOrder: string[] = [];
  const skippedProviders: ProviderStackRequestPlan<Provider, Role>["skippedProviders"] = [];
  for (const providerId of requestedOrder) {
    if (seen.has(providerId)) continue;
    seen.add(providerId);
    const provider = providerMap.get(providerId);
    if (!provider) {
      skippedProviders.push({ providerId, reason: input.unknownProviderReason });
      continue;
    }
    if (!provider.roles.includes(input.role)) {
      skippedProviders.push({ providerId, reason: input.unsupportedRoleReason?.(provider, input.role) ?? `Provider does not support ${input.role}.` });
      continue;
    }
    if (provider.status === "disabled") {
      skippedProviders.push({ providerId, reason: input.disabledProviderReason });
      continue;
    }
    const blockedReason = input.blockedProviderReason?.(provider, input.role, input.stack);
    if (blockedReason) {
      skippedProviders.push({ providerId, reason: blockedReason });
      continue;
    }
    providerOrder.push(providerId);
  }
  return { providers: input.stack.providers, providerOrder, skippedProviders };
}

export function updateProviderStackOrder<SchemaVersion extends string, Role extends string, Provider extends ProviderStackProviderConfig<Role>>(
  input: {
    stack: ProviderStackSettings<SchemaVersion, Role, Provider>;
    role: NoInfer<Role>;
    providerOrder: string[];
    defaultPreferences: Record<Role, string[]>;
    updatedAt?: string;
  },
): ProviderStackSettings<SchemaVersion, Role, Provider> {
  const providerMap = new Map(input.stack.providers.map((provider) => [provider.providerId, provider]));
  return {
    ...input.stack,
    preferences: {
      ...input.stack.preferences,
      [input.role]: normalizeProviderStackOrder(input.providerOrder, input.role, providerMap, input.defaultPreferences),
    },
    updatedAt: input.updatedAt ?? new Date().toISOString(),
  };
}

export function buildProviderStackStatus<SchemaVersion extends string, Role extends string, Provider extends ProviderStackProviderConfig<Role>>(
  input: {
    schemaVersion: SchemaVersion;
    stack: ProviderStackSettings<string, Role, Provider>;
    roles: readonly Role[];
    defaultPreferences: Record<Role, string[]>;
    runtime?: Partial<Record<string, Omit<ProviderStackRuntimeSummary<Role, Provider>, "providerId" | "label" | "role" | "kind" | "configuredStatus" | "privacyLabel">>>;
    defaultAvailability?: (provider: Provider) => ProviderStackRuntimeSummary<Role, Provider>["availability"];
  },
): ProviderStackStatus<SchemaVersion, Role, Provider> {
  const byId = new Map(input.stack.providers.map((provider) => [provider.providerId, provider]));
  return {
    schemaVersion: input.schemaVersion,
    settings: input.stack,
    roles: input.roles.map((role) => ({
      role,
      providers: (input.stack.preferences[role] ?? input.defaultPreferences[role])
        .map((providerId) => byId.get(providerId))
        .filter((provider): provider is Provider => Boolean(provider))
        .map((provider) => {
          const runtime = input.runtime?.[provider.providerId];
          return {
            providerId: provider.providerId,
            label: provider.label,
            role,
            kind: provider.kind,
            configuredStatus: provider.status,
            availability: provider.status === "disabled" ? "disabled" : runtime?.availability ?? input.defaultAvailability?.(provider) ?? "unknown",
            ...(runtime?.reason ? { reason: runtime.reason } : {}),
            ...(provider.privacyLabel ? { privacyLabel: provider.privacyLabel } : {}),
          };
        }),
    })),
  };
}

export function cloneProviderStackPreferences<Role extends string>(preferences: Record<Role, string[]>): Record<Role, string[]> {
  return Object.fromEntries(
    Object.entries(preferences).map(([role, order]) => [role, [...(order as string[])]]),
  ) as Record<Role, string[]>;
}

function defaultProviderOverride<Role extends string, Provider extends ProviderStackProviderConfig<Role>>(
  provider: Provider,
  override: Record<string, unknown> | undefined,
  cloneProvider: (provider: Provider) => Provider,
): Provider {
  const cloned = cloneProvider(provider);
  return {
    ...cloned,
    status: override?.status === "disabled" ? "disabled" : "enabled",
  };
}

function objectRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
