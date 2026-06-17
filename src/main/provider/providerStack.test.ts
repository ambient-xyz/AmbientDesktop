import { describe, expect, it } from "vitest";
import {
  normalizeProviderStackSettings,
  planProviderStackOrder,
  updateProviderStackOrder,
  type ProviderStackDefinition,
  type ProviderStackProviderConfig,
} from "./providerStack";

type FixtureRole = "search" | "fetch";
type FixtureProvider = ProviderStackProviderConfig<FixtureRole, "builtin" | "custom">;

const definition: ProviderStackDefinition<"fixture-provider-stack-v1", FixtureRole, FixtureProvider> = {
  schemaVersion: "fixture-provider-stack-v1",
  roles: ["search", "fetch"],
  defaultProviders: [
    { providerId: "alpha", label: "Alpha", kind: "builtin", roles: ["search", "fetch"], status: "enabled" },
    { providerId: "beta", label: "Beta", kind: "builtin", roles: ["search"], status: "enabled" },
  ],
  defaultPreferences: {
    search: ["alpha", "beta"],
    fetch: ["alpha"],
  },
  cloneProvider: (provider) => ({ ...provider, roles: [...provider.roles] }),
  normalizeCustomProvider: (value) => {
    const record = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
    if (typeof record.providerId !== "string" || typeof record.label !== "string") return undefined;
    return {
      providerId: record.providerId,
      label: record.label,
      kind: "custom",
      roles: record.fetch === true ? ["search", "fetch"] : ["search"],
      status: record.status === "disabled" ? "disabled" : "enabled",
    };
  },
};

describe("providerStack", () => {
  it("normalizes providers and fills missing default role order", () => {
    const stack = normalizeProviderStackSettings({
      providers: [
        { providerId: "beta", status: "disabled" },
        { providerId: "gamma", label: "Gamma", fetch: true },
      ],
      preferences: {
        search: ["gamma", "missing", "alpha", "gamma"],
        fetch: ["gamma"],
      },
    }, definition);

    expect(stack.schemaVersion).toBe("fixture-provider-stack-v1");
    expect(stack.providers.map((provider) => [provider.providerId, provider.status])).toEqual([
      ["alpha", "enabled"],
      ["beta", "disabled"],
      ["gamma", "enabled"],
    ]);
    expect(stack.preferences.search).toEqual(["gamma", "alpha", "beta"]);
    expect(stack.preferences.fetch).toEqual(["gamma", "alpha"]);
  });

  it("plans and updates role order with skipped-provider diagnostics", () => {
    const stack = normalizeProviderStackSettings({
      providers: [
        { providerId: "gamma", label: "Gamma" },
      ],
      preferences: {
        search: ["gamma", "beta", "alpha"],
      },
    }, definition);
    const plan = planProviderStackOrder({
      stack,
      role: "fetch",
      providerOrder: ["missing", "beta", "gamma", "alpha"],
      defaultPreferences: definition.defaultPreferences,
      unknownProviderReason: "unknown provider",
      disabledProviderReason: "disabled provider",
      blockedProviderReason: (provider) => provider.providerId === "alpha" ? "blocked provider" : undefined,
    });

    expect(plan.providerOrder).toEqual([]);
    expect(plan.skippedProviders).toEqual([
      { providerId: "missing", reason: "unknown provider" },
      { providerId: "beta", reason: "Provider does not support fetch." },
      { providerId: "gamma", reason: "Provider does not support fetch." },
      { providerId: "alpha", reason: "blocked provider" },
    ]);

    const updated = updateProviderStackOrder({
      stack,
      role: "search",
      providerOrder: ["gamma", "alpha"],
      defaultPreferences: definition.defaultPreferences,
      updatedAt: "2026-06-02T21:00:00.000Z",
    });
    expect(updated.preferences.search).toEqual(["gamma", "alpha", "beta"]);
    expect(updated.updatedAt).toBe("2026-06-02T21:00:00.000Z");
  });
});
