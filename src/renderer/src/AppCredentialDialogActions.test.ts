import { describe, expect, it } from "vitest";

import type { DesktopState, ProviderStatus } from "../../shared/desktopTypes";
import type { AmbientCliSecretSaveResult } from "../../shared/pluginTypes";
import type { AmbientCliSecretDialogState } from "./AppDialogs";
import {
  API_KEY_PASTE_CHECK_STATUS,
  API_KEY_PASTE_STATUS,
  ambientCliSecretSavedDialog,
  ambientCliSecretValidationStatus,
  apiKeyPasteStatusForClipboard,
  desktopStateWithProvider,
  initialAmbientCliSecretDialog,
  saveAmbientCliSecretInputForDialog,
} from "./AppCredentialDialogActions";

describe("App credential dialog actions", () => {
  it("creates initial Ambient CLI secret dialogs for package, draft, and MCP secrets", () => {
    expect(initialAmbientCliSecretDialog({ packageName: "example-package", envName: "EXAMPLE_ENV" })).toMatchObject({
      packageName: "example-package",
      envName: "EXAMPLE_ENV",
      value: "",
      busy: false,
      status: { kind: "info", message: "Paste the secret here. It will not be sent as a chat message." },
    });

    expect(initialAmbientCliSecretDialog({ builderSourcePath: "/workspace/draft", packageName: "draft-package" }).status?.message)
      .toBe("Paste the draft capability secret here. It will not be sent as a chat message.");
    expect(initialAmbientCliSecretDialog({ mcpServerId: "server-1" }).status?.message)
      .toBe("Paste the MCP server secret here. It will not be sent as a chat message.");
  });

  it("validates Ambient CLI secret dialog fields before save", () => {
    expect(ambientCliSecretValidationStatus(dialog({ packageName: "", envName: "EXAMPLE_ENV", value: "placeholder-secret" }))).toEqual({
      kind: "error",
      message: "Package name is required.",
    });
    expect(ambientCliSecretValidationStatus(dialog({ packageName: "example-package", envName: "", value: "placeholder-secret" }))).toEqual({
      kind: "error",
      message: "Env name is required.",
    });
    expect(ambientCliSecretValidationStatus(dialog({ packageName: "example-package", envName: "EXAMPLE_ENV", value: "" }))).toEqual({
      kind: "error",
      message: "Secret value is required.",
    });
    expect(ambientCliSecretValidationStatus(dialog({ mcpServerId: "server-1", packageName: "", envName: "EXAMPLE_ENV", value: "placeholder-secret" }))).toBeUndefined();
  });

  it("builds Ambient CLI secret save input without leaking extra dialog fields", () => {
    expect(saveAmbientCliSecretInputForDialog(dialog({
      packageName: " example-package ",
      envName: " EXAMPLE_ENV ",
      value: " placeholder-secret ",
    }))).toEqual({
      packageName: "example-package",
      envName: "EXAMPLE_ENV",
      value: "placeholder-secret",
    });

    expect(saveAmbientCliSecretInputForDialog(dialog({
      builderSourcePath: "/workspace/draft",
      packageName: "draft-package",
      envName: "DRAFT_ENV",
      value: "placeholder-secret",
    }))).toEqual({
      builderSourcePath: "/workspace/draft",
      packageName: "draft-package",
      envName: "DRAFT_ENV",
      value: "placeholder-secret",
    });

    expect(saveAmbientCliSecretInputForDialog(dialog({
      mcpServerId: "server-1",
      mcpCandidateRef: "registry:server",
      packageName: "",
      envName: "MCP_ENV",
      value: "placeholder-secret",
    }))).toEqual({
      mcpServerId: "server-1",
      mcpCandidateRef: "registry:server",
      envName: "MCP_ENV",
      value: "placeholder-secret",
    });
  });

  it("formats saved Ambient CLI secret dialogs without retaining the secret value", () => {
    expect(ambientCliSecretSavedDialog(saveResult({ packageName: "example-package", envName: "EXAMPLE_ENV" }))).toMatchObject({
      packageName: "example-package",
      envName: "EXAMPLE_ENV",
      value: "",
      busy: false,
      status: { kind: "success", message: "EXAMPLE_ENV saved for example-package." },
    });
    expect(ambientCliSecretSavedDialog(saveResult({ packageName: "draft-package", builderSourcePath: "/workspace/draft", envName: "DRAFT_ENV" })).status?.message)
      .toBe("DRAFT_ENV saved for draft draft-package.");
    expect(ambientCliSecretSavedDialog(saveResult({ packageName: "mcp-package", mcpServerId: "server-1", envName: "MCP_ENV" })).status?.message)
      .toBe("MCP_ENV saved for MCP server.");
  });

  it("keeps API key clipboard status and provider replacement behavior stable", () => {
    expect(apiKeyPasteStatusForClipboard("12345678901234567890")).toBe(API_KEY_PASTE_STATUS);
    expect(apiKeyPasteStatusForClipboard("short")).toBe(API_KEY_PASTE_CHECK_STATUS);

    const state = {
      provider: provider({ providerLabel: "Ambient" }),
      activeThreadId: "thread-1",
    } as unknown as DesktopState;
    const nextProvider = provider({ providerLabel: "GMI Cloud" });

    expect(desktopStateWithProvider(state, nextProvider)).toEqual({
      provider: nextProvider,
      activeThreadId: "thread-1",
    });
  });
});

function dialog(overrides: Partial<AmbientCliSecretDialogState>): AmbientCliSecretDialogState {
  return {
    packageName: "example-package",
    envName: "EXAMPLE_ENV",
    value: "placeholder-secret",
    busy: false,
    ...overrides,
  };
}

function saveResult(overrides: Partial<AmbientCliSecretSaveResult>): AmbientCliSecretSaveResult {
  return {
    packageName: "example-package",
    envName: "EXAMPLE_ENV",
    source: "managed-secret",
    configured: true,
    ...overrides,
  };
}

function provider(overrides: Partial<ProviderStatus>): ProviderStatus {
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
