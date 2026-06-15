import { describe, expect, it } from "vitest";
import type { ProviderStatus } from "../shared/types";
import {
  formatRuntimeError,
  shouldOpenApiKeyDialogForRuntimeError,
} from "./agentRuntimeErrorFormatting";

const provider: ProviderStatus = {
  providerId: "ambient",
  providerLabel: "Ambient API",
  debugOverride: false,
  baseUrl: "https://api.ambient.xyz/v1",
  model: "ambient-preview",
  hasApiKey: true,
  source: "saved",
  storage: "os-encrypted",
};

describe("agentRuntimeErrorFormatting", () => {
  it("uses API-key setup guidance when the provider has no key", () => {
    expect(formatRuntimeError("local setup failed", undefined, {
      ...provider,
      hasApiKey: false,
      source: "missing",
      storage: "none",
    })).toBe([
      "Ambient API key is not configured.",
      "",
      "Use the API key dialog or set `AMBIENT_API_KEY` before launching the app.",
    ].join("\n"));
  });

  it("formats rejected credentials with provider and diagnostic details", () => {
    expect(formatRuntimeError("401 Unauthorized", {
      message: "401 Unauthorized",
      statusCode: 401,
      requestId: "req_123",
    }, provider)).toBe([
      "Ambient API key was rejected by Pi/Ambient.",
      "",
      "Use the API key dialog to save a valid Ambient API key, then retry this run.",
      "",
      "Provider error:",
      "401 Unauthorized",
      "",
      "Diagnostic detail:",
      "Status code: 401",
      "Request id: req_123",
    ].join("\n"));
  });

  it("formats non-auth runtime errors with diagnostic details", () => {
    expect(formatRuntimeError("upstream unavailable", {
      message: "upstream unavailable",
      status: 502,
      code: "bad_gateway",
      detailPreview: "model overloaded",
    }, provider)).toBe([
      "The Pi/Ambient runtime returned an error:",
      "",
      "upstream unavailable",
      "",
      "Diagnostic detail:",
      "Status: 502",
      "Code: bad_gateway",
      "Detail: model overloaded",
    ].join("\n"));
  });

  it("classifies errors that should reopen the API-key dialog", () => {
    expect(shouldOpenApiKeyDialogForRuntimeError({ message: "upstream unavailable", statusCode: 502 }, provider)).toBe(false);
    expect(shouldOpenApiKeyDialogForRuntimeError({ message: "403 Forbidden" }, provider)).toBe(true);
    expect(shouldOpenApiKeyDialogForRuntimeError(undefined, {
      ...provider,
      hasApiKey: false,
      source: "missing",
      storage: "none",
    })).toBe(true);
  });
});
