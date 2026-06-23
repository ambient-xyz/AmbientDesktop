import { useEffect, useState } from "react";
import type { BrowserCredentialSummary, SaveBrowserCredentialInput } from "../../shared/browserTypes";
import type { ApiKeyStatus } from "./RightPanelSettingsRuntime";

export type BrowserCredentialForm = SaveBrowserCredentialInput & {
  id?: string;
  password: string;
};

export function emptyBrowserCredentialForm(): BrowserCredentialForm {
  return { label: "", origin: "", username: "", password: "", scope: "workspace" };
}

export function browserCredentialSaveInputFromForm(browserCredentialForm: BrowserCredentialForm): SaveBrowserCredentialInput {
  return {
    ...browserCredentialForm,
    label: browserCredentialForm.label.trim(),
    origin: browserCredentialForm.origin.trim(),
    username: browserCredentialForm.username.trim(),
  };
}

export function useRightPanelBrowserCredentialController({ workspacePath }: { workspacePath: string }) {
  const [browserCredentials, setBrowserCredentials] = useState<BrowserCredentialSummary[]>([]);
  const [browserCredentialForm, setBrowserCredentialForm] = useState<BrowserCredentialForm>(emptyBrowserCredentialForm);
  const [browserCredentialBusy, setBrowserCredentialBusy] = useState<string | undefined>();
  const [browserCredentialStatus, setBrowserCredentialStatus] = useState<ApiKeyStatus | undefined>();

  function resetBrowserCredentialForm() {
    setBrowserCredentialForm(emptyBrowserCredentialForm());
  }

  useEffect(() => {
    setBrowserCredentials([]);
    resetBrowserCredentialForm();
  }, [workspacePath]);

  async function loadBrowserCredentials() {
    setBrowserCredentialStatus(undefined);
    try {
      setBrowserCredentials(await window.ambientDesktop.listBrowserCredentials());
    } catch (error) {
      setBrowserCredentialStatus({ kind: "error", message: error instanceof Error ? error.message : String(error) });
    }
  }

  function editBrowserCredential(credential: BrowserCredentialSummary) {
    setBrowserCredentialForm({
      id: credential.id,
      label: credential.label,
      origin: credential.origin,
      username: credential.username,
      password: "",
      scope: credential.scope,
    });
    setBrowserCredentialStatus({ kind: "info", message: "Enter the password again to update this stored credential." });
  }

  async function saveBrowserCredential() {
    const input = browserCredentialSaveInputFromForm(browserCredentialForm);
    if (!input.label || !input.origin || !input.username || !input.password) {
      setBrowserCredentialStatus({ kind: "error", message: "Label, origin, username, and password are required." });
      return;
    }
    setBrowserCredentialBusy("save");
    setBrowserCredentialStatus(undefined);
    try {
      const next = await window.ambientDesktop.saveBrowserCredential(input);
      setBrowserCredentials(next);
      resetBrowserCredentialForm();
      setBrowserCredentialStatus({ kind: "success", message: "Stored browser credential metadata saved." });
    } catch (error) {
      setBrowserCredentialStatus({ kind: "error", message: error instanceof Error ? error.message : String(error) });
    } finally {
      setBrowserCredentialBusy(undefined);
    }
  }

  async function deleteBrowserCredential(id: string) {
    setBrowserCredentialBusy(id);
    setBrowserCredentialStatus(undefined);
    try {
      setBrowserCredentials(await window.ambientDesktop.deleteBrowserCredential({ id }));
      if (browserCredentialForm.id === id) resetBrowserCredentialForm();
      setBrowserCredentialStatus({ kind: "success", message: "Stored browser credential deleted." });
    } catch (error) {
      setBrowserCredentialStatus({ kind: "error", message: error instanceof Error ? error.message : String(error) });
    } finally {
      setBrowserCredentialBusy(undefined);
    }
  }

  return {
    browserCredentials,
    browserCredentialForm,
    setBrowserCredentialForm,
    browserCredentialBusy,
    browserCredentialStatus,
    loadBrowserCredentials,
    resetBrowserCredentialForm,
    editBrowserCredential,
    saveBrowserCredential,
    deleteBrowserCredential,
  };
}
