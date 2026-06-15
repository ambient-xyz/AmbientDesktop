import { useEffect, useRef, useState } from "react";

import type { AmbientPluginAuthStartResult, FirstPartyGoogleIntegrationState } from "../../shared/types";
import { formatTaskState } from "./RightPanelDetailPanels";
import type { GoogleWorkspaceValidationFeedback } from "./pluginUiModel";
import type { ApiKeyStatus } from "./RightPanelSettingsRuntime";

const GOOGLE_VALIDATION_FEEDBACK_VISIBLE_MS = 6_000;

type UseRightPanelPluginAuthControllerInput = {
  panel: string;
  workspacePath: string;
  googleIntegration?: FirstPartyGoogleIntegrationState;
  onGoogleIntegrationChanged: (googleIntegration: FirstPartyGoogleIntegrationState | undefined) => void;
  loadAmbientPluginRegistry: () => Promise<void>;
  setPluginCatalogError: (message: string | undefined) => void;
};

export function useRightPanelPluginAuthController({
  panel,
  workspacePath,
  googleIntegration,
  onGoogleIntegrationChanged,
  loadAmbientPluginRegistry,
  setPluginCatalogError,
}: UseRightPanelPluginAuthControllerInput) {
  const [pluginAuthBusy, setPluginAuthBusy] = useState<string | undefined>();
  const [pluginAuthStatus, setPluginAuthStatus] = useState<ApiKeyStatus | undefined>();
  const [pluginAuthPending, setPluginAuthPending] = useState<AmbientPluginAuthStartResult | undefined>();
  const [pluginAuthCode, setPluginAuthCode] = useState("");
  const [googleSetupAccountHint, setGoogleSetupAccountHint] = useState("");
  const [googleSetupBusy, setGoogleSetupBusy] = useState<string | undefined>();
  const [googleValidationFeedback, setGoogleValidationFeedback] = useState<GoogleWorkspaceValidationFeedback | undefined>();
  const googleValidationFeedbackTimerRef = useRef<number | undefined>(undefined);

  useEffect(() => {
    return () => {
      if (googleValidationFeedbackTimerRef.current) {
        window.clearTimeout(googleValidationFeedbackTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (
      panel !== "plugins" ||
      googleIntegration?.install?.status !== "running" &&
        googleIntegration?.setup?.status !== "running" &&
        googleIntegration?.setup?.status !== "validating"
    ) return;
    const timer = window.setInterval(() => void loadGoogleIntegration(), 2_000);
    return () => window.clearInterval(timer);
  }, [panel, googleIntegration?.install?.status, googleIntegration?.setup?.status]);

  useEffect(() => {
    setPluginAuthPending(undefined);
    setPluginAuthCode("");
  }, [workspacePath]);

  function showGoogleValidationFeedback(feedback: GoogleWorkspaceValidationFeedback, autoClear = false) {
    if (googleValidationFeedbackTimerRef.current) {
      window.clearTimeout(googleValidationFeedbackTimerRef.current);
      googleValidationFeedbackTimerRef.current = undefined;
    }
    setGoogleValidationFeedback(feedback);
    if (!autoClear) return;
    googleValidationFeedbackTimerRef.current = window.setTimeout(() => {
      setGoogleValidationFeedback((current) => current?.accountId === feedback.accountId ? undefined : current);
      googleValidationFeedbackTimerRef.current = undefined;
    }, GOOGLE_VALIDATION_FEEDBACK_VISIBLE_MS);
  }

  async function loadGoogleIntegration() {
    onGoogleIntegrationChanged(await window.ambientDesktop.getFirstPartyGoogleIntegration());
  }

  async function installGoogleWorkspaceCli() {
    setPluginAuthStatus(undefined);
    setGoogleSetupBusy("install");
    try {
      const install = await window.ambientDesktop.installGoogleWorkspaceCli();
      await loadAmbientPluginRegistry();
      setPluginAuthStatus({
        kind: install.status === "completed" ? "success" : "error",
        message: install.status === "completed"
          ? `Installed Google Workspace CLI ${install.version}.`
          : install.error ?? `Google Workspace CLI install ${install.status}.`,
      });
      return install;
    } catch (error) {
      setPluginAuthStatus({ kind: "error", message: error instanceof Error ? error.message : String(error) });
      return undefined;
    } finally {
      setGoogleSetupBusy(undefined);
    }
  }

  async function startPluginAppAuth(connectorId: string, scopes?: string[]) {
    setPluginCatalogError(undefined);
    setPluginAuthStatus(undefined);
    setPluginAuthBusy(`connect:${connectorId}`);
    try {
      const pending = await window.ambientDesktop.startPluginAppAuth({ connectorId, scopes });
      setPluginAuthPending(pending);
      setPluginAuthCode("");
      setPluginAuthStatus({
        kind: "info",
        message: `Opened auth for ${pending.providerId}. Paste the returned authorization code to finish connecting.`,
      });
      await loadAmbientPluginRegistry();
    } catch (error) {
      setPluginAuthStatus({ kind: "error", message: error instanceof Error ? error.message : String(error) });
    } finally {
      setPluginAuthBusy(undefined);
    }
  }

  async function startGoogleWorkspaceSetup(command: "setup" | "login", accountHint = googleSetupAccountHint) {
    setPluginCatalogError(undefined);
    setPluginAuthStatus(undefined);
    setGoogleSetupBusy(command);
    try {
      const setup = await window.ambientDesktop.startGoogleWorkspaceSetup({
        command,
        accountHint: accountHint.trim() || undefined,
        openAuthUrl: true,
      });
      onGoogleIntegrationChanged(await window.ambientDesktop.getFirstPartyGoogleIntegration());
      const authNote = [
        setup.openedAuthUrl ? "Opened Google sign-in in Chrome." : undefined,
        setup.openedOAuthClientConfigUrl ? "Opened Google Cloud OAuth client setup in Chrome." : undefined,
      ].filter(Boolean).join(" ");
      if (setup.status === "error") {
        setPluginAuthStatus({ kind: "error", message: setup.error ?? `Google Workspace ${command} could not start.` });
      } else {
        setPluginAuthStatus({ kind: "info", message: `Started Google Workspace ${command}.${authNote ? ` ${authNote}` : ""}` });
      }
      return setup;
    } catch (error) {
      setPluginAuthStatus({ kind: "error", message: error instanceof Error ? error.message : String(error) });
      return undefined;
    } finally {
      setGoogleSetupBusy(undefined);
    }
  }

  async function confirmGoogleWorkspaceAccount(accountHint: string) {
    const normalized = accountHint.trim();
    if (!normalized) return;
    setGoogleSetupAccountHint(normalized);
    setPluginCatalogError(undefined);
    setPluginAuthStatus(undefined);
    try {
      let current = googleIntegration ?? await window.ambientDesktop.getFirstPartyGoogleIntegration();
      if (current.authMode !== "gws") {
        setPluginAuthStatus({ kind: "error", message: "Google Workspace setup is only available for the local gws adapter." });
        return;
      }
      if (current.sidecar.state === "missing") {
        const install = await installGoogleWorkspaceCli();
        if (!install || install.status !== "completed") return;
        current = await window.ambientDesktop.getFirstPartyGoogleIntegration();
      }
      if (current.sidecar.state === "missing") {
        setPluginAuthStatus({ kind: "error", message: current.unavailableReason ?? "Google Workspace CLI is not available yet." });
        return;
      }
      const login = await startGoogleWorkspaceSetup("login", normalized);
      if (login?.requiredAction === "oauth_client_config") {
        await startGoogleWorkspaceSetup("setup", normalized);
      }
    } catch (error) {
      setPluginAuthStatus({ kind: "error", message: error instanceof Error ? error.message : String(error) });
    }
  }

  async function cancelGoogleWorkspaceSetup() {
    setGoogleSetupBusy("cancel");
    setPluginAuthStatus(undefined);
    try {
      await window.ambientDesktop.cancelGoogleWorkspaceSetup();
      await loadGoogleIntegration();
      setPluginAuthStatus({ kind: "info", message: "Canceled Google Workspace setup." });
    } catch (error) {
      setPluginAuthStatus({ kind: "error", message: error instanceof Error ? error.message : String(error) });
    } finally {
      setGoogleSetupBusy(undefined);
    }
  }

  async function importGoogleWorkspaceOAuthClient(accountHint = googleSetupAccountHint) {
    setGoogleSetupBusy("import-oauth-client");
    setPluginAuthStatus(undefined);
    try {
      const setup = await window.ambientDesktop.importGoogleWorkspaceOAuthClient({ accountHint: accountHint.trim() || undefined });
      onGoogleIntegrationChanged(await window.ambientDesktop.getFirstPartyGoogleIntegration());
      if (setup.status === "completed") {
        setPluginAuthStatus({ kind: "success", message: "Imported Google Workspace OAuth client JSON. Connect the account to finish Google sign-in." });
      }
    } catch (error) {
      setPluginAuthStatus({ kind: "error", message: error instanceof Error ? error.message : String(error) });
    } finally {
      setGoogleSetupBusy(undefined);
    }
  }

  async function validateGoogleWorkspace(accountHint = googleSetupAccountHint) {
    const requestedAccountId = accountHint.trim() || "default";
    setGoogleSetupBusy("validate");
    setPluginAuthStatus(undefined);
    showGoogleValidationFeedback({ accountId: requestedAccountId, status: "validating" });
    try {
      const result = await window.ambientDesktop.validateGoogleWorkspace({ accountHint: accountHint.trim() || undefined });
      await loadAmbientPluginRegistry();
      const failed = result.checks.filter((check) => !check.ok);
      const feedbackAccountId = result.account.accountId || requestedAccountId;
      showGoogleValidationFeedback({
        accountId: feedbackAccountId,
        status: failed.length ? "failed" : "validated",
        message: failed.length
          ? `${failed.map((check) => check.label).join(", ")} failed.`
          : `Validated ${result.account.label}.`,
      }, !failed.length);
      setPluginAuthStatus({
        kind: failed.length ? "error" : "success",
        message: failed.length
          ? `${result.account.label}: ${failed.map((check) => check.label).join(", ")} failed.`
          : `Validated Google Workspace for ${result.account.label}.`,
      });
    } catch (error) {
      showGoogleValidationFeedback({
        accountId: requestedAccountId,
        status: "failed",
        message: error instanceof Error ? error.message : String(error),
      });
      setPluginAuthStatus({ kind: "error", message: error instanceof Error ? error.message : String(error) });
    } finally {
      setGoogleSetupBusy(undefined);
    }
  }

  async function disconnectGoogleWorkspace(accountHint: string) {
    const normalized = accountHint.trim();
    if (!normalized) return;
    setGoogleSetupBusy(`disconnect:${normalized}`);
    setPluginAuthStatus(undefined);
    try {
      const next = await window.ambientDesktop.disconnectGoogleWorkspace({ accountHint: normalized });
      await loadAmbientPluginRegistry();
      onGoogleIntegrationChanged(next);
      setPluginAuthStatus({ kind: "info", message: `Disconnected Google Workspace metadata for ${normalized}. gws credentials were left on disk.` });
    } catch (error) {
      setPluginAuthStatus({ kind: "error", message: error instanceof Error ? error.message : String(error) });
    } finally {
      setGoogleSetupBusy(undefined);
    }
  }

  async function completePluginAppAuth() {
    const code = pluginAuthCode.trim();
    if (!pluginAuthPending || !code) return;
    setPluginCatalogError(undefined);
    setPluginAuthStatus(undefined);
    setPluginAuthBusy(`complete:${pluginAuthPending.state}`);
    try {
      const account = await window.ambientDesktop.completePluginAppAuth({ state: pluginAuthPending.state, code });
      setPluginAuthStatus({ kind: "success", message: `Connected ${account.label}.` });
      setPluginAuthPending(undefined);
      setPluginAuthCode("");
      await loadAmbientPluginRegistry();
    } catch (error) {
      setPluginAuthStatus({ kind: "error", message: error instanceof Error ? error.message : String(error) });
    } finally {
      setPluginAuthBusy(undefined);
    }
  }

  async function revokePluginAuthAccount(accountId: string) {
    setPluginCatalogError(undefined);
    setPluginAuthStatus(undefined);
    setPluginAuthBusy(`revoke:${accountId}`);
    try {
      const account = await window.ambientDesktop.revokePluginAuthAccount({ accountId });
      setPluginAuthStatus({ kind: "success", message: `Revoked ${account.label}.` });
      await loadAmbientPluginRegistry();
    } catch (error) {
      setPluginAuthStatus({ kind: "error", message: error instanceof Error ? error.message : String(error) });
    } finally {
      setPluginAuthBusy(undefined);
    }
  }

  async function disconnectPluginAuthAccount(accountId: string) {
    setPluginCatalogError(undefined);
    setPluginAuthStatus(undefined);
    setPluginAuthBusy(`disconnect:${accountId}`);
    try {
      const account = await window.ambientDesktop.disconnectPluginAuthAccount({ accountId });
      setPluginAuthStatus({ kind: "success", message: `Disconnected ${account.label}.` });
      await loadAmbientPluginRegistry();
    } catch (error) {
      setPluginAuthStatus({ kind: "error", message: error instanceof Error ? error.message : String(error) });
    } finally {
      setPluginAuthBusy(undefined);
    }
  }

  async function testPluginAuthAccount(accountId: string) {
    setPluginCatalogError(undefined);
    setPluginAuthStatus(undefined);
    setPluginAuthBusy(`test:${accountId}`);
    try {
      const account = await window.ambientDesktop.testPluginAuthAccount({ accountId });
      setPluginAuthStatus({ kind: account.status === "available" ? "success" : "error", message: `${account.label}: ${formatTaskState(account.status)}.` });
      await loadAmbientPluginRegistry();
    } catch (error) {
      setPluginAuthStatus({ kind: "error", message: error instanceof Error ? error.message : String(error) });
    } finally {
      setPluginAuthBusy(undefined);
    }
  }

  return {
    pluginAuthBusy,
    pluginAuthStatus,
    setPluginAuthStatus,
    pluginAuthPending,
    setPluginAuthPending,
    pluginAuthCode,
    setPluginAuthCode,
    googleSetupAccountHint,
    setGoogleSetupAccountHint,
    googleSetupBusy,
    googleValidationFeedback,
    completePluginAppAuth,
    startPluginAppAuth,
    installGoogleWorkspaceCli,
    confirmGoogleWorkspaceAccount,
    startGoogleWorkspaceSetup,
    importGoogleWorkspaceOAuthClient,
    validateGoogleWorkspace,
    cancelGoogleWorkspaceSetup,
    testPluginAuthAccount,
    disconnectGoogleWorkspace,
    disconnectPluginAuthAccount,
    revokePluginAuthAccount,
  };
}
