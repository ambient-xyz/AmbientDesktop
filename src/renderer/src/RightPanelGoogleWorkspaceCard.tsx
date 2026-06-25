import type { FirstPartyGoogleIntegrationState } from "../../shared/pluginTypes";
import {
  googleWorkspaceAccountRows,
  googleWorkspaceActionState,
  googleWorkspaceConnectorLabel,
  googleWorkspaceStatusItems,
  googleWorkspaceValidationButtonView,
  googleWorkspaceValidationFeedbackForAccount,
  type GoogleWorkspaceValidationFeedback,
} from "./pluginUiModel";
import { formatTaskState } from "./RightPanelDetailPanels";
import {
  RightPanelGoogleWorkspaceAccountList,
  RightPanelGoogleWorkspaceActionStrip,
  RightPanelGoogleWorkspaceSetupGuide,
  RightPanelGoogleWorkspaceSetupStatusNotes,
} from "./RightPanelGoogleWorkspaceSections";
import { formatTimelineTime, type ApiKeyStatus } from "./RightPanelSettingsRuntime";

type MaybePromise<T = unknown> = T | Promise<T>;

const googleCoreScopes = [
  "openid",
  "email",
  "profile",
  "gmail.readonly",
  "gmail.compose",
  "calendar.readonly",
  "calendar.events",
  "drive.readonly",
  "drive.file",
];

export type RightPanelGoogleWorkspaceCardProps = {
  googleIntegration?: FirstPartyGoogleIntegrationState;
  googleSetupAccountHint: string;
  setGoogleSetupAccountHint: (hint: string) => void;
  googleSetupBusy?: string;
  googleValidationFeedback?: GoogleWorkspaceValidationFeedback;
  pluginAuthBusy?: string;
  setPluginAuthStatus: (status?: ApiKeyStatus) => void;
  startPluginAppAuth: (connectorId: string, scopes?: string[]) => MaybePromise;
  installGoogleWorkspaceCli: () => MaybePromise;
  confirmGoogleWorkspaceAccount: (accountHint: string) => MaybePromise;
  startGoogleWorkspaceSetup: (command: "setup" | "login", accountHint?: string) => MaybePromise;
  importGoogleWorkspaceOAuthClient: (accountHint?: string) => MaybePromise;
  validateGoogleWorkspace: (accountHint?: string) => MaybePromise;
  cancelGoogleWorkspaceSetup: () => MaybePromise;
  testPluginAuthAccount: (accountId: string) => MaybePromise;
  disconnectGoogleWorkspace: (accountHint: string) => MaybePromise;
  disconnectPluginAuthAccount: (accountId: string) => MaybePromise;
  revokePluginAuthAccount: (accountId: string) => MaybePromise;
};

export function RightPanelGoogleWorkspaceCard({
  googleIntegration,
  googleSetupAccountHint,
  setGoogleSetupAccountHint,
  googleSetupBusy,
  googleValidationFeedback,
  pluginAuthBusy,
  setPluginAuthStatus,
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
}: RightPanelGoogleWorkspaceCardProps) {
  const googlePrimaryConnector = googleIntegration?.connectors[0];
  const googleAccounts = googleWorkspaceAccountRows(googleIntegration?.connectors ?? [], formatTimelineTime);
  const googleHasMultipleAccounts = googleAccounts.length > 1;
  const googleSelectedAccountHint = googleSetupAccountHint.trim() || googleIntegration?.setup?.accountHint?.trim() || "";
  const googleSelectedAccount = googleSelectedAccountHint
    ? googleAccounts.find(
        (account) =>
          account.accountId === googleSelectedAccountHint ||
          account.email === googleSelectedAccountHint ||
          account.label === googleSelectedAccountHint,
      )
    : googleAccounts.length === 1
      ? googleAccounts[0]
      : undefined;
  const googleSelectedValidationFeedback = googleWorkspaceValidationFeedbackForAccount(
    googleValidationFeedback,
    googleSelectedAccount?.accountId ?? (googleSelectedAccountHint || "default"),
  );
  const googleSelectedValidateButton = googleWorkspaceValidationButtonView("Validate", googleSelectedValidationFeedback);
  const googleUsesGws = googleIntegration?.authMode === "gws";
  const googleInstallRunning = googleIntegration?.install?.status === "running";
  const googleSetupRunning = googleIntegration?.setup?.status === "running" || googleIntegration?.setup?.status === "validating";
  const googleNeedsOAuthClientConfig = googleIntegration?.setup?.requiredAction === "oauth_client_config";
  const googleOAuthClientConfigUrl = googleIntegration?.setup?.oauthClientConfigUrl;
  const googleInstallAction = googleWorkspaceActionState(googleIntegration, "install", googleSetupBusy);
  const googleConnectAction = googleWorkspaceActionState(googleIntegration, "connect", googleSetupBusy);
  const googleRepairAction = googleWorkspaceActionState(googleIntegration, "repair", googleSetupBusy);
  const googleValidateAction = googleWorkspaceActionState(googleIntegration, "validate", googleSetupBusy);
  const googleCancelAction = googleWorkspaceActionState(googleIntegration, "cancel", googleSetupBusy);
  const googleAccountAvailable = googleAccounts.some((account) => account.status === "available");
  const googleSelectedAccountAvailable = googleSelectedAccount?.status === "available" || (!googleSelectedAccountHint && googleAccountAvailable);
  const googleOAuthClientImported =
    googleIntegration?.setup?.status === "completed" && googleIntegration.setup.command === "setup" && !googleNeedsOAuthClientConfig;
  const googleOAuthClientConfigured = Boolean(
    googleIntegration?.setup?.oauthClientConfigured ||
      googleOAuthClientImported ||
      googleSelectedAccountAvailable,
  );
  const googleConfiguredNotAuthenticated = googleOAuthClientConfigured && !googleSelectedAccountAvailable;
  const googleSetupAccountControlDisabled = googleSetupRunning || googleInstallRunning || Boolean(googleSetupBusy);
  const googleConnectDisabled = googleConnectAction.disabled || !googleOAuthClientConfigured;
  const googleConnectTitle = !googleOAuthClientConfigured
    ? "Create or import a Google Desktop OAuth client JSON before connecting this account."
    : googleConnectAction.title;
  const googleValidateDisabled = googleValidateAction.disabled || (!googleSelectedAccount && googleAccounts.length === 0);
  const googleValidateTitle = !googleSelectedAccount && googleAccounts.length === 0
    ? "Connect a Google account before validating connectors."
    : googleValidateAction.title;
  const googleSetupGuideVisible = googleUsesGws && (
    googleNeedsOAuthClientConfig ||
    googleOAuthClientImported ||
    googleConfiguredNotAuthenticated ||
    googleAccounts.length === 0 ||
    !googleAccountAvailable ||
    googleSetupRunning
  );

  return (
    <section className="plugin-row google-integration-card">
      <div className="plugin-row-header">
        <strong>Google Workspace</strong>
        <div className="plugin-row-actions">
          {!googleUsesGws && (
            <button
              type="button"
              className="panel-button mini"
              disabled={!googleIntegration?.enabled || Boolean(pluginAuthBusy)}
              title={googleIntegration?.unavailableReason ?? "Connect a Google account for first-party Gmail, Calendar, and Drive workflow connectors."}
              onClick={() => void startPluginAppAuth("google.gmail", googleCoreScopes)}
            >
              {googleAccounts.length ? "Connect another" : "Connect"}
            </button>
          )}
          {googleUsesGws && googleInstallAction.visible && (
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
          <span>{googleIntegration?.enabled ? formatTaskState(googlePrimaryConnector?.status ?? "not_configured") : "Unavailable"}</span>
        </div>
      </div>
      <p>
        First-party Gmail, Calendar, and Drive connectors for Workflow Agent{googleUsesGws ? " using Ambient-managed gws." : "."}
      </p>
      <div className="google-integration-summary" aria-label="Google Workspace status">
        {googleWorkspaceStatusItems(googleIntegration, formatTimelineTime).map((item) => (
          <div key={item}>
            <span>{item}</span>
          </div>
        ))}
      </div>
      <div className="plugin-badges">
        {(googleIntegration?.connectors ?? []).map((connector) => (
          <span key={connector.connectorId}>
            {googleWorkspaceConnectorLabel(connector.connectorId)} - {formatTaskState(connector.status)}
          </span>
        ))}
        {googleAccounts.length > 0 && <span>{googleAccounts.length} account{googleAccounts.length === 1 ? "" : "s"}</span>}
      </div>
      {googleIntegration?.unavailableReason && <p>{googleIntegration.unavailableReason}</p>}
      {googleSetupGuideVisible && (
        <RightPanelGoogleWorkspaceSetupGuide
          googleIntegration={googleIntegration}
          googleAccountsCount={googleAccounts.length}
          googleAccountAvailable={googleAccountAvailable}
          googleSetupAccountHint={googleSetupAccountHint}
          googleHasMultipleAccounts={googleHasMultipleAccounts}
          googleSetupBusy={googleSetupBusy}
          googleSetupRunning={googleSetupRunning}
          googleInstallRunning={googleInstallRunning}
          googleSetupAccountControlDisabled={googleSetupAccountControlDisabled}
          googleSelectedAccountHint={googleSelectedAccountHint}
          googleSelectedAccountAvailable={googleSelectedAccountAvailable}
          googleConfiguredNotAuthenticated={googleConfiguredNotAuthenticated}
          googleNeedsOAuthClientConfig={googleNeedsOAuthClientConfig}
          googleOAuthClientConfigUrl={googleOAuthClientConfigUrl}
          googleOAuthClientConfigured={googleOAuthClientConfigured}
          googleInstallAction={googleInstallAction}
          googleConnectDisabled={googleConnectDisabled}
          googleConnectTitle={googleConnectTitle}
          googleValidateDisabled={googleValidateDisabled}
          googleValidateTitle={googleValidateTitle}
          googleSelectedValidateButton={googleSelectedValidateButton}
          setPluginAuthStatus={setPluginAuthStatus}
          installGoogleWorkspaceCli={installGoogleWorkspaceCli}
          confirmGoogleWorkspaceAccount={confirmGoogleWorkspaceAccount}
          startGoogleWorkspaceSetup={startGoogleWorkspaceSetup}
          importGoogleWorkspaceOAuthClient={importGoogleWorkspaceOAuthClient}
          validateGoogleWorkspace={validateGoogleWorkspace}
        />
      )}
      {googleUsesGws && !googleSetupGuideVisible && (
        <RightPanelGoogleWorkspaceActionStrip
          googleSetupAccountHint={googleSetupAccountHint}
          googleHasMultipleAccounts={googleHasMultipleAccounts}
          googleSetupBusy={googleSetupBusy}
          googleSetupRunning={googleSetupRunning}
          googleInstallRunning={googleInstallRunning}
          googleSetupAccountControlDisabled={googleSetupAccountControlDisabled}
          googleConnectAction={googleConnectAction}
          googleRepairAction={googleRepairAction}
          googleValidateAction={googleValidateAction}
          googleCancelAction={googleCancelAction}
          googleConnectDisabled={googleConnectDisabled}
          googleConnectTitle={googleConnectTitle}
          googleValidateDisabled={googleValidateDisabled}
          googleValidateTitle={googleValidateTitle}
          googleSelectedValidateButton={googleSelectedValidateButton}
          confirmGoogleWorkspaceAccount={confirmGoogleWorkspaceAccount}
          startGoogleWorkspaceSetup={startGoogleWorkspaceSetup}
          validateGoogleWorkspace={validateGoogleWorkspace}
          cancelGoogleWorkspaceSetup={cancelGoogleWorkspaceSetup}
        />
      )}
      {googleUsesGws && (
        <RightPanelGoogleWorkspaceSetupStatusNotes
          googleIntegration={googleIntegration}
          googleNeedsOAuthClientConfig={googleNeedsOAuthClientConfig}
        />
      )}
      <RightPanelGoogleWorkspaceAccountList
        googleAccounts={googleAccounts}
        googleUsesGws={googleUsesGws}
        googleSetupRunning={googleSetupRunning}
        googleInstallRunning={googleInstallRunning}
        googleSetupBusy={googleSetupBusy}
        pluginAuthBusy={pluginAuthBusy}
        googleValidationFeedback={googleValidationFeedback}
        googleValidateAction={googleValidateAction}
        googleConnectAction={googleConnectAction}
        setGoogleSetupAccountHint={setGoogleSetupAccountHint}
        validateGoogleWorkspace={validateGoogleWorkspace}
        startGoogleWorkspaceSetup={startGoogleWorkspaceSetup}
        disconnectGoogleWorkspace={disconnectGoogleWorkspace}
        testPluginAuthAccount={testPluginAuthAccount}
        disconnectPluginAuthAccount={disconnectPluginAuthAccount}
        revokePluginAuthAccount={revokePluginAuthAccount}
      />
      {googleIntegration?.sidecar?.binaryPath && (
        <code className="plugin-cache-path">
          {googleIntegration.sidecar.binaryPath}
          {googleIntegration.sidecar.configDir ? `\nconfig: ${googleIntegration.sidecar.configDir}` : ""}
        </code>
      )}
    </section>
  );
}
