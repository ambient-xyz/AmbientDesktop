import { AlertCircle, CheckCircle2, LoaderCircle } from "lucide-react";
import { FormEvent, memo, useState } from "react";

import type { FirstPartyGoogleIntegrationState } from "../../shared/pluginTypes";
import {
  googleWorkspaceValidationButtonView,
  googleWorkspaceValidationFeedbackForAccount,
  type GoogleWorkspaceAccountRow,
  type GoogleWorkspaceValidationButtonView,
  type GoogleWorkspaceValidationFeedback,
  type PluginActionState,
} from "./pluginUiModel";
import { formatTaskState } from "./RightPanelDetailPanels";
import type { ApiKeyStatus } from "./RightPanelSettingsRuntime";

type MaybePromise<T = unknown> = T | Promise<T>;

type GoogleSetupAccountControlProps = {
  accountHint: string;
  placeholder: string;
  disabled: boolean;
  busy: boolean;
  onConfirm: (accountHint: string) => void;
};

export const GoogleSetupAccountControl = memo(function GoogleSetupAccountControl(props: GoogleSetupAccountControlProps) {
  return <GoogleSetupAccountDraftControl key={props.accountHint} {...props} />;
});

function GoogleSetupAccountDraftControl({
  accountHint,
  placeholder,
  disabled,
  busy,
  onConfirm,
}: GoogleSetupAccountControlProps) {
  const [draft, setDraft] = useState(accountHint);
  const trimmed = draft.trim();

  function submitAccount(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (disabled || !trimmed) return;
    onConfirm(trimmed);
  }

  return (
    <form className="google-setup-account-control" onSubmit={submitAccount}>
      <input
        type="text"
        className="panel-input"
        value={draft}
        placeholder={placeholder}
        disabled={disabled}
        onChange={(event) => setDraft(event.target.value)}
      />
      <button
        type="submit"
        className="panel-button mini primary"
        disabled={disabled || !trimmed}
        title="Confirm this Google account and continue setup."
      >
        {busy ? "Working" : "OK"}
      </button>
    </form>
  );
}

export function GoogleWorkspaceValidationButtonIcon({ icon }: { icon: GoogleWorkspaceValidationButtonView["icon"] }) {
  if (icon === "spinner") return <LoaderCircle size={13} className="spin" />;
  if (icon === "success") return <CheckCircle2 size={13} />;
  if (icon === "error") return <AlertCircle size={13} />;
  return null;
}

export type RightPanelGoogleWorkspaceSetupGuideProps = {
  googleIntegration?: FirstPartyGoogleIntegrationState;
  googleAccountsCount: number;
  googleAccountAvailable: boolean;
  googleSetupAccountHint: string;
  googleHasMultipleAccounts: boolean;
  googleSetupBusy?: string;
  googleSetupRunning: boolean;
  googleInstallRunning: boolean;
  googleSetupAccountControlDisabled: boolean;
  googleSelectedAccountHint: string;
  googleSelectedAccountAvailable: boolean;
  googleConfiguredNotAuthenticated: boolean;
  googleNeedsOAuthClientConfig: boolean;
  googleOAuthClientConfigUrl?: string;
  googleOAuthClientConfigured: boolean;
  googleInstallAction: PluginActionState;
  googleConnectDisabled: boolean;
  googleConnectTitle: string;
  googleValidateDisabled: boolean;
  googleValidateTitle: string;
  googleSelectedValidateButton: GoogleWorkspaceValidationButtonView;
  setPluginAuthStatus: (status?: ApiKeyStatus) => void;
  installGoogleWorkspaceCli: () => MaybePromise;
  confirmGoogleWorkspaceAccount: (accountHint: string) => MaybePromise;
  startGoogleWorkspaceSetup: (command: "setup" | "login", accountHint?: string) => MaybePromise;
  importGoogleWorkspaceOAuthClient: (accountHint?: string) => MaybePromise;
  validateGoogleWorkspace: (accountHint?: string) => MaybePromise;
};

export function RightPanelGoogleWorkspaceSetupGuide({
  googleIntegration,
  googleAccountsCount,
  googleAccountAvailable,
  googleSetupAccountHint,
  googleHasMultipleAccounts,
  googleSetupBusy,
  googleSetupRunning,
  googleInstallRunning,
  googleSetupAccountControlDisabled,
  googleSelectedAccountHint,
  googleSelectedAccountAvailable,
  googleConfiguredNotAuthenticated,
  googleNeedsOAuthClientConfig,
  googleOAuthClientConfigUrl,
  googleOAuthClientConfigured,
  googleInstallAction,
  googleConnectDisabled,
  googleConnectTitle,
  googleValidateDisabled,
  googleValidateTitle,
  googleSelectedValidateButton,
  setPluginAuthStatus,
  installGoogleWorkspaceCli,
  confirmGoogleWorkspaceAccount,
  startGoogleWorkspaceSetup,
  importGoogleWorkspaceOAuthClient,
  validateGoogleWorkspace,
}: RightPanelGoogleWorkspaceSetupGuideProps) {
  return (
    <section className="google-setup-guide" aria-label="Google Workspace setup guide">
      <div className="google-setup-guide-header">
        <div>
          <strong>Google Workspace setup</strong>
          <span>Please enter the Google username you wish to add and then hit enter or OK</span>
        </div>
        <GoogleSetupAccountControl
          accountHint={googleSetupAccountHint}
          placeholder={googleHasMultipleAccounts ? "Account handle from row below" : "Google username or email"}
          disabled={googleSetupAccountControlDisabled}
          busy={Boolean(googleSetupBusy) || googleSetupRunning || googleInstallRunning}
          onConfirm={(accountHint) => void confirmGoogleWorkspaceAccount(accountHint)}
        />
      </div>
      {googleSelectedAccountHint && (
        <div className={`google-setup-state-banner ${googleSelectedAccountAvailable ? "success" : googleConfiguredNotAuthenticated ? "warning" : "info"}`}>
          <strong>{googleSelectedAccountHint}</strong>
          <span>
            {googleSelectedAccountAvailable
              ? "Google account authenticated and ready for connector validation."
              : googleConfiguredNotAuthenticated
                ? "Desktop OAuth client configured. Google account not authenticated yet."
                : googleNeedsOAuthClientConfig
                  ? "Desktop OAuth client JSON required before Google sign-in can start."
                  : "Press OK to install gws and continue Google setup for this account."}
          </span>
        </div>
      )}
      <ol className="google-setup-steps">
        <li className={googleIntegration?.sidecar.state === "available" ? "complete" : "current"}>
          <span className="google-step-number">1</span>
          <div>
            <strong>Install gws</strong>
            <span>Ambient installs the pinned Google Workspace CLI into this stable base.</span>
          </div>
          {googleInstallAction.visible && (
            <button
              type="button"
              className="panel-button mini"
              disabled={googleInstallAction.disabled}
              title={googleInstallAction.title}
              onClick={() => void installGoogleWorkspaceCli()}
            >
              {googleInstallAction.label}
            </button>
          )}
        </li>
        <li className={googleOAuthClientConfigured || googleAccountAvailable ? "complete" : googleIntegration?.sidecar.state === "available" ? "current" : "pending"}>
          <span className="google-step-number">2</span>
          <div>
            <strong>Create a Desktop OAuth client</strong>
            <span>Use Google Cloud Console to create a Desktop app client and download `client_secret_*.json`.</span>
          </div>
          <button
            type="button"
            className="panel-button mini"
            disabled={googleIntegration?.sidecar.state === "missing" || googleSetupAccountControlDisabled}
            title={googleOAuthClientConfigUrl ? "Open the Google Cloud OAuth client page in Chrome." : "Run gws setup to open the Google Cloud OAuth client page in Chrome."}
            onClick={() => {
              if (googleOAuthClientConfigUrl) {
                void window.ambientDesktop.openExternalUrl(googleOAuthClientConfigUrl).catch((error) => {
                  setPluginAuthStatus({ kind: "error", message: error instanceof Error ? error.message : String(error) });
                });
              } else {
                void startGoogleWorkspaceSetup("setup", googleSetupAccountHint);
              }
            }}
          >
            (2) Open Google Console
          </button>
        </li>
        <li className={googleOAuthClientConfigured || googleAccountAvailable ? "complete" : googleNeedsOAuthClientConfig ? "current" : "pending"}>
          <span className="google-step-number">3</span>
          <div>
            <strong>Import OAuth JSON</strong>
            <span>Select the downloaded `client_secret_*.json`; Ambient copies it into the local gws account.</span>
          </div>
          <button
            type="button"
            className="panel-button mini"
            disabled={googleIntegration?.sidecar.state === "missing" || googleSetupAccountControlDisabled}
            title="Import the downloaded Google OAuth Desktop client JSON into this local gws account."
            onClick={() => void importGoogleWorkspaceOAuthClient(googleSetupAccountHint)}
          >
            {googleSetupBusy === "import-oauth-client" ? "Importing" : "(3) Import OAuth JSON"}
          </button>
        </li>
        <li className={googleSelectedAccountAvailable ? "complete" : googleOAuthClientConfigured ? "current" : "pending"}>
          <span className="google-step-number">4</span>
          <div>
            <strong>Connect Google account</strong>
            <span>Open Google sign-in in Chrome and let gws save credentials for Gmail, Calendar, and Drive.</span>
          </div>
          <button
            type="button"
            className="panel-button mini"
            disabled={googleConnectDisabled}
            title={googleConnectTitle}
            onClick={() => void startGoogleWorkspaceSetup("login", googleSetupAccountHint)}
          >
            (4) Connect account
          </button>
        </li>
        <li className={googleSelectedAccountAvailable ? "complete" : googleAccountsCount > 0 ? "current" : "pending"}>
          <span className="google-step-number">5</span>
          <div>
            <strong>Validate connectors</strong>
            <span>Run identity, Gmail, Calendar, and Drive read probes before exposing the account to workflows.</span>
          </div>
          <button
            type="button"
            className={`panel-button mini google-validate-button ${googleSelectedValidateButton.tone}`}
            disabled={googleValidateDisabled}
            title={googleValidateTitle}
            onClick={() => void validateGoogleWorkspace(googleSetupAccountHint)}
          >
            <GoogleWorkspaceValidationButtonIcon icon={googleSelectedValidateButton.icon} />
            (5) {googleSelectedValidateButton.label}
          </button>
        </li>
      </ol>
    </section>
  );
}

export type RightPanelGoogleWorkspaceActionStripProps = {
  googleSetupAccountHint: string;
  googleHasMultipleAccounts: boolean;
  googleSetupBusy?: string;
  googleSetupRunning: boolean;
  googleInstallRunning: boolean;
  googleSetupAccountControlDisabled: boolean;
  googleConnectAction: PluginActionState;
  googleRepairAction: PluginActionState;
  googleValidateAction: PluginActionState;
  googleCancelAction: PluginActionState;
  googleConnectDisabled: boolean;
  googleConnectTitle: string;
  googleValidateDisabled: boolean;
  googleValidateTitle: string;
  googleSelectedValidateButton: GoogleWorkspaceValidationButtonView;
  confirmGoogleWorkspaceAccount: (accountHint: string) => MaybePromise;
  startGoogleWorkspaceSetup: (command: "setup" | "login", accountHint?: string) => MaybePromise;
  validateGoogleWorkspace: (accountHint?: string) => MaybePromise;
  cancelGoogleWorkspaceSetup: () => MaybePromise;
};

export function RightPanelGoogleWorkspaceActionStrip({
  googleSetupAccountHint,
  googleHasMultipleAccounts,
  googleSetupBusy,
  googleSetupRunning,
  googleInstallRunning,
  googleSetupAccountControlDisabled,
  googleConnectAction,
  googleRepairAction,
  googleValidateAction,
  googleCancelAction,
  googleConnectDisabled,
  googleConnectTitle,
  googleValidateDisabled,
  googleValidateTitle,
  googleSelectedValidateButton,
  confirmGoogleWorkspaceAccount,
  startGoogleWorkspaceSetup,
  validateGoogleWorkspace,
  cancelGoogleWorkspaceSetup,
}: RightPanelGoogleWorkspaceActionStripProps) {
  return (
    <div className="google-action-strip">
      <GoogleSetupAccountControl
        accountHint={googleSetupAccountHint}
        placeholder={googleHasMultipleAccounts ? "Account handle from row below" : "Google username or email"}
        disabled={googleSetupAccountControlDisabled}
        busy={Boolean(googleSetupBusy) || googleSetupRunning || googleInstallRunning}
        onConfirm={(accountHint) => void confirmGoogleWorkspaceAccount(accountHint)}
      />
      <button
        type="button"
        className="panel-button mini"
        disabled={googleConnectDisabled}
        title={googleConnectTitle}
        onClick={() => void startGoogleWorkspaceSetup("login", googleSetupAccountHint)}
      >
        (4) {googleConnectAction.label}
      </button>
      <button
        type="button"
        className="panel-button mini"
        disabled={googleRepairAction.disabled}
        title={googleRepairAction.title}
        onClick={() => void startGoogleWorkspaceSetup("setup")}
      >
        (2) {googleRepairAction.label}
      </button>
      <button
        type="button"
        className={`panel-button mini google-validate-button ${googleSelectedValidateButton.tone}`}
        disabled={googleValidateDisabled}
        title={googleValidateTitle}
        onClick={() => void validateGoogleWorkspace(googleSetupAccountHint)}
      >
        <GoogleWorkspaceValidationButtonIcon icon={googleSelectedValidateButton.icon} />
        (5) {googleSelectedValidateButton.label === "Validate" ? googleValidateAction.label : googleSelectedValidateButton.label}
      </button>
      {googleCancelAction.visible && (
        <button
          type="button"
          className="panel-button mini danger"
          disabled={googleCancelAction.disabled}
          title={googleCancelAction.title}
          onClick={() => void cancelGoogleWorkspaceSetup()}
        >
          {googleCancelAction.label}
        </button>
      )}
    </div>
  );
}

export function RightPanelGoogleWorkspaceSetupStatusNotes({
  googleIntegration,
  googleNeedsOAuthClientConfig,
}: {
  googleIntegration?: FirstPartyGoogleIntegrationState;
  googleNeedsOAuthClientConfig: boolean;
}) {
  return (
    <>
      {googleIntegration?.install && googleIntegration.install.status !== "idle" && (
        <div className="plugin-note-list">
          <span>CLI install {formatTaskState(googleIntegration.install.status)}</span>
          <span>gws {googleIntegration.install.version}</span>
          {googleIntegration.install.binaryPath && <span>{googleIntegration.install.binaryPath}</span>}
          {googleIntegration.install.error && <span>{googleIntegration.install.error}</span>}
        </div>
      )}
      {googleIntegration?.setup && googleIntegration.setup.status !== "idle" && (
        <div className="plugin-note-list">
          <span>Setup {formatTaskState(googleIntegration.setup.status)}</span>
          {googleIntegration.setup.command && <span>Command gws auth {googleIntegration.setup.command}</span>}
          {googleIntegration.setup.accountHint && <span>Account {googleIntegration.setup.accountHint}</span>}
          {googleIntegration.setup.oauthClientConfigured === true && <span>Desktop OAuth client configured</span>}
          {googleIntegration.setup.oauthClientConfigured === false && <span>Desktop OAuth client not configured</span>}
          {googleIntegration.setup.discoveredEmail && <span>Signed in {googleIntegration.setup.discoveredEmail}</span>}
          {googleIntegration.setup.openedAuthUrl && <span>Browser sign-in opened</span>}
          {googleNeedsOAuthClientConfig && <span>Desktop OAuth client JSON required</span>}
          {googleIntegration.setup.openedOAuthClientConfigUrl && <span>Google Cloud Console opened in Chrome</span>}
          {googleIntegration.setup.error && <span>{googleIntegration.setup.error}</span>}
          {googleIntegration.setup.outputTail && (
            <details className="google-setup-technical-log">
              <summary>Show technical log</summary>
              <code className="plugin-cache-path google-setup-output">{googleIntegration.setup.outputTail}</code>
            </details>
          )}
        </div>
      )}
    </>
  );
}

export type RightPanelGoogleWorkspaceAccountListProps = {
  googleAccounts: GoogleWorkspaceAccountRow[];
  googleUsesGws: boolean;
  googleSetupRunning: boolean;
  googleInstallRunning: boolean;
  googleSetupBusy?: string;
  pluginAuthBusy?: string;
  googleValidationFeedback?: GoogleWorkspaceValidationFeedback;
  googleValidateAction: PluginActionState;
  googleConnectAction: PluginActionState;
  setGoogleSetupAccountHint: (hint: string) => void;
  validateGoogleWorkspace: (accountHint?: string) => MaybePromise;
  startGoogleWorkspaceSetup: (command: "setup" | "login", accountHint?: string) => MaybePromise;
  disconnectGoogleWorkspace: (accountHint: string) => MaybePromise;
  testPluginAuthAccount: (accountId: string) => MaybePromise;
  disconnectPluginAuthAccount: (accountId: string) => MaybePromise;
  revokePluginAuthAccount: (accountId: string) => MaybePromise;
};

export function RightPanelGoogleWorkspaceAccountList({
  googleAccounts,
  googleUsesGws,
  googleSetupRunning,
  googleInstallRunning,
  googleSetupBusy,
  pluginAuthBusy,
  googleValidationFeedback,
  googleValidateAction,
  googleConnectAction,
  setGoogleSetupAccountHint,
  validateGoogleWorkspace,
  startGoogleWorkspaceSetup,
  disconnectGoogleWorkspace,
  testPluginAuthAccount,
  disconnectPluginAuthAccount,
  revokePluginAuthAccount,
}: RightPanelGoogleWorkspaceAccountListProps) {
  if (googleAccounts.length === 0) return null;

  return (
    <div className="google-account-list">
      {googleAccounts.map((account) => {
        const accountValidationFeedback = googleWorkspaceValidationFeedbackForAccount(googleValidationFeedback, account.accountId);
        const accountValidateButton = googleWorkspaceValidationButtonView("Validate", accountValidationFeedback);
        return (
          <div className={`google-account-row ${accountValidationFeedback?.status ?? ""}`} key={account.id}>
            <div>
              <strong>{account.identityLabel}</strong>
              <span>
                {formatTaskState(account.status)}
                {account.connectorLabels.length ? ` - ${account.connectorLabels.join(", ")}` : ""}
                {account.lastValidatedLabel ? ` - validated ${account.lastValidatedLabel}` : ""}
              </span>
              {accountValidationFeedback?.message && (
                <span className={`google-validation-inline-status ${accountValidationFeedback.status}`} role="status" aria-live="polite">
                  <GoogleWorkspaceValidationButtonIcon icon={accountValidateButton.icon} />
                  {accountValidationFeedback.message}
                </span>
              )}
              {googleUsesGws && <code>handle: {account.handleLabel}</code>}
              {account.validationError && <span className="google-account-error">{account.validationError}</span>}
            </div>
            <div className="google-account-actions">
              {googleUsesGws ? (
                <>
                  <button
                    type="button"
                    className="panel-button mini"
                    disabled={googleSetupRunning || googleInstallRunning || Boolean(googleSetupBusy)}
                    title="Use this local gws account handle in the Google action box."
                    onClick={() => setGoogleSetupAccountHint(account.accountId)}
                  >
                    Use
                  </button>
                  <button
                    type="button"
                    className={`panel-button mini google-validate-button ${accountValidateButton.tone}`}
                    disabled={googleValidateAction.disabled}
                    title={googleValidateAction.title}
                    onClick={() => void validateGoogleWorkspace(account.accountId)}
                  >
                    <GoogleWorkspaceValidationButtonIcon icon={accountValidateButton.icon} />
                    {accountValidateButton.label}
                  </button>
                  <button
                    type="button"
                    className="panel-button mini"
                    disabled={googleConnectAction.disabled}
                    title="Start Google sign-in again for this local gws account."
                    onClick={() => void startGoogleWorkspaceSetup("login", account.accountId)}
                  >
                    Repair
                  </button>
                  <button
                    type="button"
                    className="panel-button mini danger"
                    disabled={Boolean(googleSetupBusy)}
                    title="Remove this account from Ambient metadata. Local gws credential files are left in place."
                    onClick={() => void disconnectGoogleWorkspace(account.accountId)}
                  >
                    {googleSetupBusy === `disconnect:${account.accountId}` ? "Disconnecting" : "Disconnect"}
                  </button>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    className="panel-button mini"
                    disabled={Boolean(pluginAuthBusy)}
                    onClick={() => void testPluginAuthAccount(account.id)}
                  >
                    Test
                  </button>
                  <button
                    type="button"
                    className="panel-button mini"
                    disabled={Boolean(pluginAuthBusy)}
                    onClick={() => void disconnectPluginAuthAccount(account.id)}
                  >
                    Disconnect
                  </button>
                  <button
                    type="button"
                    className="panel-button mini danger"
                    disabled={Boolean(pluginAuthBusy)}
                    onClick={() => void revokePluginAuthAccount(account.id)}
                  >
                    Revoke
                  </button>
                </>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
