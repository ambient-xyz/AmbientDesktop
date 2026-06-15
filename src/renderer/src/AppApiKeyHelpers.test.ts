import { describe, expect, it } from "vitest";

import {
  getInitialApiKeyStatus,
  looksLikeApiKey,
} from "./AppApiKeyHelpers";

import type { ProviderStatus } from "../../shared/types";

describe("API key dialog helpers", () => {
  it("reports the initial API key status for saved and environment-backed providers", () => {
    expect(getInitialApiKeyStatus(providerStatus({ source: "saved", providerLabel: "GMI Cloud" }))).toEqual({
      kind: "success",
      message: "A saved GMI Cloud API key is active.",
    });
    expect(getInitialApiKeyStatus(providerStatus({ source: "env", providerLabel: "Ambient" }))).toEqual({
      kind: "info",
      message: "Using a Ambient API key from the environment or startup file. Saving a key here will replace it for this app.",
    });
  });

  it("does not report an initial status without saved or environment-backed keys", () => {
    expect(getInitialApiKeyStatus()).toBeUndefined();
    expect(getInitialApiKeyStatus(providerStatus({ source: "missing", providerLabel: "GMI Cloud" }))).toBeUndefined();
  });

  it("recognizes plausible clipboard API keys without accepting whitespace", () => {
    expect(looksLikeApiKey("12345678901234567890")).toBe(true);
    expect(looksLikeApiKey("1234567890123456789")).toBe(false);
    expect(looksLikeApiKey("1234567890 1234567890")).toBe(false);
    expect(looksLikeApiKey("1234567890\n1234567890")).toBe(false);
  });
});

function providerStatus(overrides: Partial<ProviderStatus>): ProviderStatus {
  return {
    providerId: "ambient",
    providerLabel: "Ambient",
    baseUrl: "https://ambient.example.test",
    model: "ambient-model",
    source: "missing",
    storage: "none",
    hasApiKey: false,
    ...overrides,
  };
}
