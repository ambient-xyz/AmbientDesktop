import type { Dispatch, SetStateAction } from "react";

import type { DesktopState, ProviderStatus } from "../../shared/desktopTypes";
import type { AmbientCliSecretSaveResult, SaveAmbientCliSecretInput } from "../../shared/pluginTypes";
import type { AmbientCliSecretDialogState } from "./AppDialogs";
import type { ApiKeyStatus } from "./RightPanel";
import {
  getInitialApiKeyStatus,
  looksLikeApiKey,
} from "./AppApiKeyHelpers";

export type AmbientCliSecretDialogInput = {
  packageId?: string;
  packageName?: string;
  builderSourcePath?: string;
  mcpServerId?: string;
  mcpCandidateId?: string;
  mcpCandidateRef?: string;
  envName?: string;
};

export const CLIPBOARD_EMPTY_STATUS: ApiKeyStatus = { kind: "error", message: "Clipboard is empty." };
export const AMBIENT_CLI_SECRET_PASTE_STATUS: ApiKeyStatus = { kind: "info", message: "Clipboard pasted into the secret dialog." };
export const API_KEY_PASTE_STATUS: ApiKeyStatus = { kind: "info", message: "Clipboard pasted." };
export const API_KEY_PASTE_CHECK_STATUS: ApiKeyStatus = { kind: "info", message: "Clipboard pasted. Check the key before saving." };

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function isAmbientCliMcpSecret(input: Pick<AmbientCliSecretDialogInput, "mcpServerId" | "mcpCandidateId" | "mcpCandidateRef">): boolean {
  return Boolean(input.mcpServerId || input.mcpCandidateId || input.mcpCandidateRef);
}

export function initialAmbientCliSecretDialog(input: AmbientCliSecretDialogInput = {}): AmbientCliSecretDialogState {
  const isMcpSecret = isAmbientCliMcpSecret(input);
  return {
    packageId: input.packageId,
    packageName: input.packageName ?? "",
    builderSourcePath: input.builderSourcePath,
    mcpServerId: input.mcpServerId,
    mcpCandidateId: input.mcpCandidateId,
    mcpCandidateRef: input.mcpCandidateRef,
    envName: input.envName ?? "",
    value: "",
    busy: false,
    status: {
      kind: "info",
      message: isMcpSecret
        ? "Paste the MCP server secret here. It will not be sent as a chat message."
        : input.builderSourcePath
          ? "Paste the draft capability secret here. It will not be sent as a chat message."
          : "Paste the secret here. It will not be sent as a chat message.",
    },
  };
}

export function ambientCliSecretValidationStatus(dialog: AmbientCliSecretDialogState): ApiKeyStatus | undefined {
  const packageName = dialog.packageName.trim();
  const envName = dialog.envName.trim();
  const value = dialog.value.trim();
  const isMcpSecret = isAmbientCliMcpSecret(dialog);
  if (!isMcpSecret && !packageName && !dialog.packageId && !dialog.builderSourcePath) {
    return { kind: "error", message: "Package name is required." };
  }
  if (!envName) return { kind: "error", message: "Env name is required." };
  if (!value) return { kind: "error", message: "Secret value is required." };
  return undefined;
}

export function saveAmbientCliSecretInputForDialog(dialog: AmbientCliSecretDialogState): SaveAmbientCliSecretInput {
  const packageName = dialog.packageName.trim();
  const envName = dialog.envName.trim();
  const value = dialog.value.trim();
  const isMcpSecret = isAmbientCliMcpSecret(dialog);
  return {
    ...(dialog.builderSourcePath
      ? { builderSourcePath: dialog.builderSourcePath, packageName }
      : isMcpSecret
        ? {
            ...(packageName ? { packageName } : {}),
            ...(dialog.mcpServerId ? { mcpServerId: dialog.mcpServerId } : {}),
            ...(dialog.mcpCandidateId ? { mcpCandidateId: dialog.mcpCandidateId } : {}),
            ...(dialog.mcpCandidateRef ? { mcpCandidateRef: dialog.mcpCandidateRef } : {}),
          }
        : dialog.packageId
          ? { packageId: dialog.packageId }
          : { packageName }),
    envName,
    value,
  };
}

export function ambientCliSecretSavedDialog(result: AmbientCliSecretSaveResult): AmbientCliSecretDialogState {
  return {
    packageId: result.packageId,
    packageName: result.packageName,
    builderSourcePath: result.builderSourcePath,
    mcpServerId: result.mcpServerId,
    mcpCandidateId: result.mcpCandidateId,
    mcpCandidateRef: result.mcpCandidateRef,
    envName: result.envName,
    value: "",
    busy: false,
    status: {
      kind: "success",
      message: result.mcpServerId || result.mcpCandidateId || result.mcpCandidateRef
        ? `${result.envName} saved for MCP server.`
        : result.builderSourcePath
          ? `${result.envName} saved for draft ${result.packageName}.`
          : `${result.envName} saved for ${result.packageName}.`,
    },
  };
}

export function apiKeyPasteStatusForClipboard(text: string): ApiKeyStatus {
  return looksLikeApiKey(text) ? API_KEY_PASTE_STATUS : API_KEY_PASTE_CHECK_STATUS;
}

export function desktopStateWithProvider(state: DesktopState, provider: ProviderStatus): DesktopState {
  return { ...state, provider };
}

export function createAppCredentialDialogActions({
  ambientCliSecretDialog,
  apiKeyDraft,
  focusAmbientCliSecretInput,
  focusApiKeyInput,
  provider,
  setAmbientCliSecretDialog,
  setApiDialogOpen,
  setApiKeyBusy,
  setApiKeyDraft,
  setApiKeyStatus,
  setClipboardCandidate,
  setState,
}: {
  ambientCliSecretDialog: AmbientCliSecretDialogState | undefined;
  apiKeyDraft: string;
  focusAmbientCliSecretInput: (delayMs: number) => void;
  focusApiKeyInput: (delayMs: number) => void;
  provider: ProviderStatus | undefined;
  setAmbientCliSecretDialog: Dispatch<SetStateAction<AmbientCliSecretDialogState | undefined>>;
  setApiDialogOpen: Dispatch<SetStateAction<boolean>>;
  setApiKeyBusy: Dispatch<SetStateAction<boolean>>;
  setApiKeyDraft: Dispatch<SetStateAction<string>>;
  setApiKeyStatus: Dispatch<SetStateAction<ApiKeyStatus | undefined>>;
  setClipboardCandidate: Dispatch<SetStateAction<string>>;
  setState: Dispatch<SetStateAction<DesktopState | undefined>>;
}): {
  clearSavedApiKey: () => Promise<void>;
  openAmbientCliSecretDialog: (input?: AmbientCliSecretDialogInput) => void;
  openAmbientKeys: () => Promise<void>;
  openApiKeyDialog: (prefill?: string) => Promise<void>;
  pasteAmbientCliSecret: () => Promise<void>;
  pasteApiKey: () => Promise<void>;
  saveAmbientCliSecret: () => Promise<void>;
  saveApiKey: (value?: string) => Promise<void>;
  testApiKey: () => Promise<void>;
  updateAmbientCliSecretDialog: (patch: Partial<AmbientCliSecretDialogState>) => void;
} {
  function replaceProvider(nextProvider: ProviderStatus): void {
    setState((current) => (current ? desktopStateWithProvider(current, nextProvider) : current));
  }

  async function openApiKeyDialog(prefill = ""): Promise<void> {
    setApiDialogOpen(true);
    setApiKeyDraft(prefill);
    setClipboardCandidate("");
    setApiKeyStatus(getInitialApiKeyStatus(provider));
    focusApiKeyInput(30);

    try {
      const text = (await window.ambientDesktop.readClipboardText()).trim();
      if (looksLikeApiKey(text)) {
        setClipboardCandidate(text);
      }
    } catch {
      setClipboardCandidate("");
    }
  }

  function openAmbientCliSecretDialog(input: AmbientCliSecretDialogInput = {}): void {
    setAmbientCliSecretDialog(initialAmbientCliSecretDialog(input));
    focusAmbientCliSecretInput(30);
  }

  function updateAmbientCliSecretDialog(patch: Partial<AmbientCliSecretDialogState>): void {
    setAmbientCliSecretDialog((current) => (current ? { ...current, ...patch } : current));
  }

  async function pasteAmbientCliSecret(): Promise<void> {
    const text = (await window.ambientDesktop.readClipboardText()).trim();
    if (!text) {
      updateAmbientCliSecretDialog({ status: CLIPBOARD_EMPTY_STATUS });
      return;
    }
    updateAmbientCliSecretDialog({
      value: text,
      status: AMBIENT_CLI_SECRET_PASTE_STATUS,
    });
    focusAmbientCliSecretInput(20);
  }

  async function saveAmbientCliSecret(): Promise<void> {
    if (!ambientCliSecretDialog) return;
    const validationStatus = ambientCliSecretValidationStatus(ambientCliSecretDialog);
    if (validationStatus) {
      updateAmbientCliSecretDialog({ status: validationStatus });
      return;
    }
    updateAmbientCliSecretDialog({ busy: true });
    try {
      const result = await window.ambientDesktop.saveAmbientCliSecret(saveAmbientCliSecretInputForDialog(ambientCliSecretDialog));
      setAmbientCliSecretDialog(ambientCliSecretSavedDialog(result));
    } catch (error) {
      updateAmbientCliSecretDialog({
        busy: false,
        status: { kind: "error", message: errorMessage(error) },
      });
    }
  }

  async function openAmbientKeys(): Promise<void> {
    await window.ambientDesktop.openAmbientKeys();
  }

  async function pasteApiKey(): Promise<void> {
    const text = (await window.ambientDesktop.readClipboardText()).trim();
    if (!text) {
      setApiKeyStatus(CLIPBOARD_EMPTY_STATUS);
      return;
    }
    setApiKeyDraft(text);
    setApiKeyStatus(apiKeyPasteStatusForClipboard(text));
    focusApiKeyInput(20);
  }

  async function saveApiKey(value = apiKeyDraft): Promise<void> {
    const key = value.trim();
    const providerLabel = provider?.providerLabel ?? "Ambient";
    if (!key) {
      setApiKeyStatus({ kind: "error", message: `Paste a ${providerLabel} API key first.` });
      return;
    }
    setApiKeyBusy(true);
    try {
      const nextProvider = await window.ambientDesktop.saveAmbientApiKey(key);
      replaceProvider(nextProvider);
      setApiKeyDraft("");
      setClipboardCandidate("");
      setApiKeyStatus({ kind: "success", message: `${nextProvider.providerLabel ?? providerLabel} API key saved.` });
    } catch (error) {
      setApiKeyStatus({ kind: "error", message: errorMessage(error) });
    } finally {
      setApiKeyBusy(false);
    }
  }

  async function clearSavedApiKey(): Promise<void> {
    setApiKeyBusy(true);
    try {
      const nextProvider = await window.ambientDesktop.clearAmbientApiKey();
      replaceProvider(nextProvider);
      setApiKeyDraft("");
      setApiKeyStatus({
        kind: nextProvider.hasApiKey ? "info" : "success",
        message: nextProvider.hasApiKey ? "Saved key cleared. Using the environment key." : "Saved key cleared.",
      });
    } catch (error) {
      setApiKeyStatus({ kind: "error", message: errorMessage(error) });
    } finally {
      setApiKeyBusy(false);
    }
  }

  async function testApiKey(): Promise<void> {
    setApiKeyBusy(true);
    try {
      const result = await window.ambientDesktop.testAmbientApiKey(apiKeyDraft.trim() || undefined);
      setApiKeyStatus({ kind: result.ok ? "success" : "error", message: result.message });
    } finally {
      setApiKeyBusy(false);
    }
  }

  return {
    clearSavedApiKey,
    openAmbientCliSecretDialog,
    openAmbientKeys,
    openApiKeyDialog,
    pasteAmbientCliSecret,
    pasteApiKey,
    saveAmbientCliSecret,
    saveApiKey,
    testApiKey,
    updateAmbientCliSecretDialog,
  };
}
