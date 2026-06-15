import { describe, expect, it } from "vitest";
import { buildProviderCatalogCardOnboardingPrompt } from "../renderer/src/pluginUiModel";
import { providerCatalogEntries, providerCatalogSettingsState, validateProviderCatalog } from "./providerCatalog";

const SECRET_VALUE_PATTERNS = [
  /\bsk-[A-Za-z0-9_-]{12,}\b/,
  /\bgh[pousr]_[A-Za-z0-9_]{20,}\b/,
  /\bxox[baprs]-[A-Za-z0-9-]{20,}\b/,
  /\bAIza[0-9A-Za-z_-]{20,}\b/,
  /\b(?:api[_-]?key|token|secret|password)\s*[:=]\s*["']?[A-Za-z0-9_./+=-]{8,}/i,
];

describe("provider catalog deployment gate", () => {
  it("keeps the catalog deployable without hidden secret values or host calls", () => {
    const validation = validateProviderCatalog();
    expect(validation.errors).toEqual([]);

    for (const entry of providerCatalogEntries) {
      const serialized = JSON.stringify(entry);
      for (const pattern of SECRET_VALUE_PATTERNS) {
        expect(serialized, `${entry.id} contains a secret-shaped literal`).not.toMatch(pattern);
      }

      for (const secret of entry.secrets) {
        expect(secret.envName, `${entry.id} secret env names must be names only`).toMatch(/^[A-Z0-9_]+$/);
        expect(secret.capture, `${entry.id} must use Ambient-managed secret capture`).toMatch(/^ambient_(capability_builder_secret_request|cli_secret_request|cli_env_bind)$/);
      }

      const declaredHosts = new Set(entry.networkHosts);
      for (const host of [...entry.networkHosts, ...(entry.capabilityBuilderDefaults?.networkHosts ?? [])]) {
        const configuredHostPlaceholder = /^configured [a-z -]+ host$/i.test(host);
        expect(
          /^[a-z0-9*.-]+(?::\d+)?$/i.test(host) || configuredHostPlaceholder,
          `${entry.id} host must be a hostname or explicit configured-host placeholder, not a URL or path`,
        ).toBe(true);
        expect(host, `${entry.id} host must not embed protocol/path/query text`).not.toMatch(/https?:|\/|\?|=|@/i);
      }
      for (const host of entry.capabilityBuilderDefaults?.networkHosts ?? []) {
        expect(declaredHosts.has(host), `${entry.id} builder default host must be declared on the card`).toBe(true);
      }

      const externalRuntime = entry.runtimeState?.externalService && entry.runtimeState.serviceKind !== "none";
      const hostedOrConnector = ["cloud", "hybrid", "connector", "browser-mediated"].includes(entry.providerKind);
      const deploymentCandidate = !["experimental", "research-needed"].includes(entry.recommendationTier);
      if ((hostedOrConnector || externalRuntime) && deploymentCandidate) {
        expect(
          entry.networkHosts.length > 0 ||
            entry.providerKind === "browser-mediated" ||
            entry.runtimeState?.serviceKind === "docker-compose" ||
            entry.runtimeState?.serviceKind === "local-daemon",
          `${entry.id} external provider needs explicit host, browser mediation, or self-hosted runtime state`,
        ).toBe(true);
      }
    }
  });

  it("gates recommended secret-backed providers on credentialed evidence", () => {
    const recommendedSecretProviders = providerCatalogEntries.filter(
      (entry) =>
        entry.secrets.length > 0 &&
        (["default", "recommended"].includes(entry.recommendationTier) ||
          (entry.recommendationMemo?.deploymentRole === "fallback" && entry.researchStatus === "live-dogfooded")),
    );

    expect(recommendedSecretProviders.map((entry) => entry.id)).toEqual(expect.arrayContaining(["voice.elevenlabs", "voice.cartesia", "search.brave"]));
    for (const entry of recommendedSecretProviders) {
      const evidenceTypes = entry.evidence.map((item) => item.type);
      expect(evidenceTypes, `${entry.id} needs live dogfood evidence before deployment`).toContain("pi-live-dogfood");
      expect(evidenceTypes, `${entry.id} needs at least one credentialed secret-path smoke before deployment`).toContain("credentialed-smoke");
      expect(entry.costPrivacyNotes.join("\n"), `${entry.id} must disclose cloud/credential cost or privacy tradeoffs`).toMatch(/cost|quota|cloud|provider|pricing|privacy|secret|credential/i);
      expect(entry.safetyBoundaries.join("\n"), `${entry.id} must declare safety/approval boundaries`).toMatch(/approval|consent|secret|routing|sandbox|preview|public|quota/i);
    }
  });

  it("keeps Settings provider prompts aligned with catalog cards and approval boundaries", () => {
    const state = providerCatalogSettingsState(new Date("2026-05-11T12:00:00.000Z"));
    const settingsCards = state.cards.filter((card) => ["voice-generation", "voice-recognition", "web-search"].includes(card.capabilityArea));

    expect(settingsCards.map((card) => card.id)).toEqual(expect.arrayContaining(["voice.piper", "stt.qwen-asr", "search.brave"]));
    for (const card of settingsCards) {
      const prompt = buildProviderCatalogCardOnboardingPrompt(card);
      expect(prompt).toContain(`Selected catalog card id: ${card.id}.`);
      expect(prompt).toContain(`Capability area: ${card.capabilityArea}.`);
      expect(prompt).toContain(`Validation target: ${card.ambientContract.validationTarget}`);
      expect(prompt).toContain("ambient_tool_call to run ambient_provider_catalog");
      expect(prompt).toContain("Settings did not install anything.");
      expect(prompt).toContain("Use Ambient-managed secret flows only.");
      if (card.installability?.status === "not-installable") {
        expect(prompt).toContain("Installability: not-installable.");
        expect(prompt).toContain("This catalog card is not installable");
        expect(prompt).toContain("Do not call ambient_capability_builder_plan");
        expect(prompt).not.toContain("Then call ambient_capability_builder_plan");
        expect(prompt).not.toContain("Use installed-provider status tools before claiming active state");
      } else {
        expect(prompt).toContain("Then call ambient_capability_builder_plan");
        expect(prompt).toContain("Use installed-provider status tools before claiming active state");
      }
      expect(prompt).not.toMatch(/paste your API key|send me your API key|type your API key/i);
      for (const secret of card.secrets) {
        expect(prompt).toContain(`${secret.envName}: ${secret.required ? "required" : "optional"} via ${secret.capture}`);
      }
      for (const host of card.networkHosts) {
        expect(prompt).toContain(host);
      }
    }
  });
});
