import { describe, expect, it } from "vitest";
import {
  buildLocalDeepResearchProviderDiscovery,
  buildLocalDeepResearchProviderStackStatus,
  defaultLocalModelResourceSettings,
  describeLocalDeepResearchProvider,
  localDeepResearchProviderPreferenceUpdateText,
  planLocalDeepResearchProviderPreferenceUpdate,
} from "./localDeepResearchProviderStack";

describe("localDeepResearchProviderStack", () => {
  it("defaults LiteResearcher as the active local deep research provider", () => {
    const status = buildLocalDeepResearchProviderStackStatus();

    expect(status.activeProvider).toMatchObject({
      providerId: "local.deep-research.literesearcher",
      kind: "first-party",
      finalSynthesis: {
        mode: "local",
      },
    });
    expect(status.providerOrder).toEqual(["local.deep-research.literesearcher"]);
    expect(status.roles[0].providers[0]).toMatchObject({
      providerId: "local.deep-research.literesearcher",
      availability: "available",
    });
  });

  it("prioritizes configured providers and can reset back to LiteResearcher", () => {
    const current = {
      providerStack: {
        schemaVersion: "ambient-local-deep-research-provider-stack-v1" as const,
        providers: [
          {
            providerId: "local.deep-research.fixture",
            label: "Fixture Research",
            kind: "test-adapter" as const,
            roles: ["research" as const],
            status: "enabled" as const,
          },
        ],
        preferences: {
          research: ["local.deep-research.fixture", "local.deep-research.literesearcher"],
        },
      },
      localModelResources: defaultLocalModelResourceSettings(),
    };
    const status = buildLocalDeepResearchProviderStackStatus({ settings: current });
    expect(status.activeProvider).toMatchObject({ providerId: "local.deep-research.fixture" });

    const reset = planLocalDeepResearchProviderPreferenceUpdate(
      { action: "reset_defaults", reason: "Use the first-party default again." },
      current,
      new Date("2026-06-02T21:30:00.000Z"),
    );
    expect(reset.nextSettings.providerStack.preferences.research).toEqual(["local.deep-research.literesearcher"]);
    expect(localDeepResearchProviderPreferenceUpdateText(reset, reset.nextSettings)).toContain("LiteResearcher");

    const preferFixture = planLocalDeepResearchProviderPreferenceUpdate(
      { action: "prefer_provider", providerId: "local.deep-research.fixture" },
      reset.nextSettings,
      new Date("2026-06-02T21:31:00.000Z"),
    );
    expect(preferFixture.nextSettings.providerStack.preferences.research).toEqual(["local.deep-research.fixture", "local.deep-research.literesearcher"]);
  });

  it("sets complete provider order from configured provider labels", () => {
    const current = {
      providerStack: {
        schemaVersion: "ambient-local-deep-research-provider-stack-v1" as const,
        providers: [
          {
            providerId: "local.deep-research.fixture",
            label: "Fixture Research",
            kind: "test-adapter" as const,
            roles: ["research" as const],
            status: "enabled" as const,
          },
        ],
        preferences: {
          research: ["local.deep-research.literesearcher", "local.deep-research.fixture"],
        },
      },
      localModelResources: defaultLocalModelResourceSettings(),
    };

    const plan = planLocalDeepResearchProviderPreferenceUpdate(
      { action: "set_order", providerOrder: ["Fixture Research", "LiteResearcher"] },
      current,
      new Date("2026-06-02T21:30:00.000Z"),
    );

    expect(plan.nextSettings.providerStack.preferences.research).toEqual([
      "local.deep-research.fixture",
      "local.deep-research.literesearcher",
    ]);
  });

  it("searches configured providers and known addable deep-research cards", () => {
    const result = buildLocalDeepResearchProviderDiscovery({ query: "LiteResearcher", limit: 5 });
    expect(result.configuredProviders).toEqual(expect.arrayContaining([
      expect.objectContaining({ providerId: "local.deep-research.literesearcher" }),
    ]));
    expect(result.knownAddableProviders).toEqual(expect.arrayContaining([
      expect.objectContaining({ displayName: expect.stringContaining("LiteResearcher") }),
    ]));

    const described = describeLocalDeepResearchProvider({ provider: "local.deep-research.literesearcher" });
    expect(described.selectedProvider).toMatchObject({
      source: "configured",
      providerId: "local.deep-research.literesearcher",
    });
  });

  it("updates configured provider final synthesis mode", () => {
    const current = {
      providerStack: {
        schemaVersion: "ambient-local-deep-research-provider-stack-v1" as const,
        providers: [
          {
            providerId: "local.deep-research.fixture",
            label: "Fixture Research",
            kind: "test-adapter" as const,
            roles: ["research" as const],
            status: "enabled" as const,
          },
        ],
        preferences: {
          research: ["local.deep-research.fixture", "local.deep-research.literesearcher"],
        },
      },
      localModelResources: defaultLocalModelResourceSettings(),
    };

    const plan = planLocalDeepResearchProviderPreferenceUpdate(
      {
        action: "set_final_synthesis",
        providerId: "local.deep-research.fixture",
        finalSynthesisMode: "evidence_only",
        sourceLimit: 8,
        evidencePreviewChars: 900,
        reason: "Let the parent model do the final answer.",
      },
      current,
      new Date("2026-06-02T21:32:00.000Z"),
    );

    expect(plan).toMatchObject({
      action: "set_final_synthesis",
      hasChanges: true,
      nextProvider: {
        providerId: "local.deep-research.fixture",
        finalSynthesis: {
          mode: "evidence_only",
          sourceLimit: 8,
          evidencePreviewChars: 900,
        },
      },
    });
    expect(localDeepResearchProviderPreferenceUpdateText(plan, plan.nextSettings)).toContain("provider final synthesis updated");
  });
});
