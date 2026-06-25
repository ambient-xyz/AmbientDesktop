import { CheckCircle2, FolderOpen, RefreshCw, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { KeyboardEvent as ReactKeyboardEvent } from "react";

import type {
  AmbientGeneratedCapabilitySummary,
  AmbientPluginCapabilityDiagnostics,
  AmbientPluginCapabilitySummary,
  FirstPartyGoogleIntegrationState,
} from "../../shared/pluginTypes";
import {
  capabilityDiagnosticsActionState,
  formatAmbientAvailability,
  formatAmbientCapabilityKind,
  formatAmbientPluginSourceKind,
  formatAmbientRuntimeSupport,
  generatedCapabilityRemovalPlanActionState,
  generatedCapabilitySourceActionState,
  generatedCapabilityUpdatePlanActionState,
  generatedCapabilityValidationActionState,
  type GoogleWorkspaceValidationFeedback,
} from "./pluginUiModel";
import { formatTaskState } from "./RightPanelDetailPanels";
import { RightPanelGoogleWorkspaceCard } from "./RightPanelGoogleWorkspaceCard";
import type { ApiKeyStatus } from "./RightPanelSettingsRuntime";

type MaybePromise<T = unknown> = T | Promise<T>;

export type RightPanelPluginCapabilitiesPaneProps = {
  capabilities: AmbientPluginCapabilitySummary[];
  running: boolean;
  pluginCapabilityDiagnostics?: AmbientPluginCapabilityDiagnostics;
  pluginCapabilityDiagnosticsBusy?: string;
  generatedCapabilitySourceOpening?: string;
  generatedCapabilityValidationStarting?: string;
  generatedCapabilityUpdatePlanning?: string;
  generatedCapabilityRemovalPlanning?: string;
  pluginAuthBusy?: string;
  googleIntegration?: FirstPartyGoogleIntegrationState;
  googleSetupAccountHint: string;
  setGoogleSetupAccountHint: (hint: string) => void;
  googleSetupBusy?: string;
  googleValidationFeedback?: GoogleWorkspaceValidationFeedback;
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
  revealGeneratedCapabilitySource: (path: string | undefined) => MaybePromise;
  startGeneratedCapabilityValidation: (packageName: string, generated: AmbientGeneratedCapabilitySummary | undefined) => MaybePromise;
  startGeneratedCapabilityUpdatePlan: (packageName: string, generated: AmbientGeneratedCapabilitySummary | undefined) => MaybePromise;
  startGeneratedCapabilityRemovalPlan: (packageName: string, generated: AmbientGeneratedCapabilitySummary | undefined) => MaybePromise;
  inspectAmbientPluginCapability: (capabilityId: string) => MaybePromise;
};

export function RightPanelPluginCapabilitiesPane({
  capabilities,
  running,
  pluginCapabilityDiagnostics,
  pluginCapabilityDiagnosticsBusy,
  generatedCapabilitySourceOpening,
  generatedCapabilityValidationStarting,
  generatedCapabilityUpdatePlanning,
  generatedCapabilityRemovalPlanning,
  pluginAuthBusy,
  googleIntegration,
  googleSetupAccountHint,
  setGoogleSetupAccountHint,
  googleSetupBusy,
  googleValidationFeedback,
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
  revealGeneratedCapabilitySource,
  startGeneratedCapabilityValidation,
  startGeneratedCapabilityUpdatePlan,
  startGeneratedCapabilityRemovalPlan,
  inspectAmbientPluginCapability,
}: RightPanelPluginCapabilitiesPaneProps) {
  return (
    <div className="plugin-list">
      <RightPanelGoogleWorkspaceCard
        googleIntegration={googleIntegration}
        googleSetupAccountHint={googleSetupAccountHint}
        setGoogleSetupAccountHint={setGoogleSetupAccountHint}
        googleSetupBusy={googleSetupBusy}
        googleValidationFeedback={googleValidationFeedback}
        pluginAuthBusy={pluginAuthBusy}
        setPluginAuthStatus={setPluginAuthStatus}
        startPluginAppAuth={startPluginAppAuth}
        installGoogleWorkspaceCli={installGoogleWorkspaceCli}
        confirmGoogleWorkspaceAccount={confirmGoogleWorkspaceAccount}
        startGoogleWorkspaceSetup={startGoogleWorkspaceSetup}
        importGoogleWorkspaceOAuthClient={importGoogleWorkspaceOAuthClient}
        validateGoogleWorkspace={validateGoogleWorkspace}
        cancelGoogleWorkspaceSetup={cancelGoogleWorkspaceSetup}
        testPluginAuthAccount={testPluginAuthAccount}
        disconnectGoogleWorkspace={disconnectGoogleWorkspace}
        disconnectPluginAuthAccount={disconnectPluginAuthAccount}
        revokePluginAuthAccount={revokePluginAuthAccount}
      />
      {capabilities.length > 0 ? (
        capabilities.map((capability) => (
          <RightPanelPluginCapabilityRow
            key={capability.id}
            capability={capability}
            running={running}
            diagnostics={pluginCapabilityDiagnostics?.capabilityId === capability.id ? pluginCapabilityDiagnostics : undefined}
            diagnosticsBusy={pluginCapabilityDiagnosticsBusy}
            generatedCapabilitySourceOpening={generatedCapabilitySourceOpening}
            generatedCapabilityValidationStarting={generatedCapabilityValidationStarting}
            generatedCapabilityUpdatePlanning={generatedCapabilityUpdatePlanning}
            generatedCapabilityRemovalPlanning={generatedCapabilityRemovalPlanning}
            pluginAuthBusy={pluginAuthBusy}
            startPluginAppAuth={startPluginAppAuth}
            testPluginAuthAccount={testPluginAuthAccount}
            disconnectPluginAuthAccount={disconnectPluginAuthAccount}
            revokePluginAuthAccount={revokePluginAuthAccount}
            revealGeneratedCapabilitySource={revealGeneratedCapabilitySource}
            startGeneratedCapabilityValidation={startGeneratedCapabilityValidation}
            startGeneratedCapabilityUpdatePlan={startGeneratedCapabilityUpdatePlan}
            startGeneratedCapabilityRemovalPlan={startGeneratedCapabilityRemovalPlan}
            inspectAmbientPluginCapability={inspectAmbientPluginCapability}
          />
        ))
      ) : (
        <p className="panel-note">No plugin capabilities match the selected filters.</p>
      )}
    </div>
  );
}

type RightPanelPluginCapabilityRowProps = {
  capability: AmbientPluginCapabilitySummary;
  running: boolean;
  diagnostics?: AmbientPluginCapabilityDiagnostics;
  diagnosticsBusy?: string;
  generatedCapabilitySourceOpening?: string;
  generatedCapabilityValidationStarting?: string;
  generatedCapabilityUpdatePlanning?: string;
  generatedCapabilityRemovalPlanning?: string;
  pluginAuthBusy?: string;
  startPluginAppAuth: (connectorId: string, scopes?: string[]) => MaybePromise;
  testPluginAuthAccount: (accountId: string) => MaybePromise;
  disconnectPluginAuthAccount: (accountId: string) => MaybePromise;
  revokePluginAuthAccount: (accountId: string) => MaybePromise;
  revealGeneratedCapabilitySource: (path: string | undefined) => MaybePromise;
  startGeneratedCapabilityValidation: (packageName: string, generated: AmbientGeneratedCapabilitySummary | undefined) => MaybePromise;
  startGeneratedCapabilityUpdatePlan: (packageName: string, generated: AmbientGeneratedCapabilitySummary | undefined) => MaybePromise;
  startGeneratedCapabilityRemovalPlan: (packageName: string, generated: AmbientGeneratedCapabilitySummary | undefined) => MaybePromise;
  inspectAmbientPluginCapability: (capabilityId: string) => MaybePromise;
};

function RightPanelPluginCapabilityRow({
  capability,
  running,
  diagnostics,
  diagnosticsBusy,
  generatedCapabilitySourceOpening,
  generatedCapabilityValidationStarting,
  generatedCapabilityUpdatePlanning,
  generatedCapabilityRemovalPlanning,
  pluginAuthBusy,
  startPluginAppAuth,
  testPluginAuthAccount,
  disconnectPluginAuthAccount,
  revokePluginAuthAccount,
  revealGeneratedCapabilitySource,
  startGeneratedCapabilityValidation,
  startGeneratedCapabilityUpdatePlan,
  startGeneratedCapabilityRemovalPlan,
  inspectAmbientPluginCapability,
}: RightPanelPluginCapabilityRowProps) {
  const diagnosticsAction = capabilityDiagnosticsActionState(capability, diagnosticsBusy);
  const generatedSourceAction = generatedCapabilitySourceActionState(capability.generated, generatedCapabilitySourceOpening);
  const generatedValidationAction = generatedCapabilityValidationActionState(capability.generated, {
    busyPath: generatedCapabilityValidationStarting,
    running,
  });
  const generatedUpdatePlanAction = generatedCapabilityUpdatePlanActionState(capability.generated, {
    busyPath: generatedCapabilityUpdatePlanning,
    running,
  });
  const generatedRemovalPlanAction = generatedCapabilityRemovalPlanActionState(capability.generated, {
    busyPath: generatedCapabilityRemovalPlanning,
    running,
  });

  return (
    <section className="plugin-row">
      <div className="plugin-row-header">
        <strong>{capability.displayName ?? capability.name}</strong>
        <div className="plugin-row-actions">
          {capability.kind === "app" && capability.connectorId && capability.authStatus !== "unavailable" && (
            <button
              type="button"
              className="panel-button mini"
              disabled={Boolean(pluginAuthBusy)}
              onClick={() => void startPluginAppAuth(capability.connectorId!)}
            >
              {capability.authAccountCount ? "Reconnect" : "Connect"}
            </button>
          )}
          {diagnosticsAction.visible && (
            <button
              type="button"
              className="panel-button mini"
              disabled={diagnosticsAction.disabled}
              title={diagnosticsAction.title}
              onClick={() => void inspectAmbientPluginCapability(capability.id)}
            >
              {diagnosticsAction.label}
            </button>
          )}
          {generatedSourceAction.visible && (
            <button
              type="button"
              className="panel-button mini icon-panel-button"
              disabled={generatedSourceAction.disabled}
              title={generatedSourceAction.title}
              onClick={() => void revealGeneratedCapabilitySource(capability.generated?.sourcePath)}
            >
              <FolderOpen size={13} />
              {generatedSourceAction.label}
            </button>
          )}
          <span>{formatAmbientAvailability(capability.availability)}</span>
        </div>
      </div>
      {capability.description && <PluginCapabilityDescriptionDisclosure capability={capability} />}
      <div className="plugin-badges">
        <span>{formatAmbientCapabilityKind(capability.kind)}</span>
        <span>{capability.pluginDisplayName ?? capability.pluginName}</span>
        <span>{formatAmbientRuntimeSupport(capability.runtimeSupport)}</span>
        <span>{formatAmbientPluginSourceKind(capability.sourceKind)}</span>
        {capability.serverName && <span>MCP {capability.serverName}</span>}
        {capability.connectorId && <span>Connector {capability.connectorId}</span>}
        {capability.authStatus && <span>Auth {formatTaskState(capability.authStatus)}</span>}
        {capability.authProviderId && <span>Provider {capability.authProviderId}</span>}
        {capability.authAccountCount !== undefined && <span>{capability.authAccountCount} account{capability.authAccountCount === 1 ? "" : "s"}</span>}
        {capability.supportLabels.map((label) => (
          <span className="plugin-support-label" key={label}>{label}</span>
        ))}
      </div>
      {capability.authAccounts?.length ? (
        <div className="plugin-note-list">
          {capability.authAccounts.map((account) => (
            <span key={account.id}>
              {account.label}{account.email ? ` (${account.email})` : ""} - {formatTaskState(account.status)}
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
            </span>
          ))}
        </div>
      ) : null}
      {capability.availabilityReason && <p>{capability.availabilityReason}</p>}
      {capability.path && <code className="plugin-cache-path">{capability.path}</code>}
      {diagnostics && (
        <div className="plugin-detail-panel">
          <div className="panel-section-heading">
            <strong>Capability Details</strong>
            <span>{diagnostics.availabilityReason ?? formatAmbientAvailability(capability.availability)}</span>
          </div>
          <div className="plugin-badges">
            {diagnostics.plugin && <span>Plugin {diagnostics.plugin.displayName ?? diagnostics.plugin.name}</span>}
            {diagnostics.capability?.serverName && <span>MCP {diagnostics.capability.serverName}</span>}
            {diagnostics.capability?.connectorId && <span>Connector {diagnostics.capability.connectorId}</span>}
            {diagnostics.capability?.toolName && <span>Tool {diagnostics.capability.toolName}</span>}
          </div>
          {capability.generated && (
            <div className="plugin-detail-actions">
              <div className="plugin-note-list">
                <span>Generated capability management starts a chat-first Capability Builder flow.</span>
              </div>
              <button
                type="button"
                className="panel-button mini icon-panel-button"
                disabled={generatedValidationAction.disabled}
                title={generatedValidationAction.title}
                onClick={() => void startGeneratedCapabilityValidation(capability.displayName ?? capability.name, capability.generated)}
              >
                <CheckCircle2 size={13} />
                {generatedValidationAction.label}
              </button>
              <button
                type="button"
                className="panel-button mini icon-panel-button"
                disabled={generatedUpdatePlanAction.disabled}
                title={generatedUpdatePlanAction.title}
                onClick={() => void startGeneratedCapabilityUpdatePlan(capability.displayName ?? capability.name, capability.generated)}
              >
                <RefreshCw size={13} />
                {generatedUpdatePlanAction.label}
              </button>
              <button
                type="button"
                className="panel-button mini icon-panel-button danger"
                disabled={generatedRemovalPlanAction.disabled}
                title={generatedRemovalPlanAction.title}
                onClick={() => void startGeneratedCapabilityRemovalPlan(capability.displayName ?? capability.name, capability.generated)}
              >
                <Trash2 size={13} />
                {generatedRemovalPlanAction.label}
              </button>
            </div>
          )}
          {diagnostics.diagnostics.length > 0 ? (
            <div className="plugin-note-list">
              {diagnostics.diagnostics.map((note) => (
                <span key={note}>{note}</span>
              ))}
            </div>
          ) : (
            <p>No additional diagnostics were reported.</p>
          )}
        </div>
      )}
    </section>
  );
}

function PluginCapabilityDescriptionDisclosure({ capability }: { capability: AmbientPluginCapabilitySummary }) {
  const descriptionRef = useRef<HTMLParagraphElement>(null);
  const [clipped, setClipped] = useState(false);
  const [open, setOpen] = useState(false);
  const popoverId = `plugin-capability-description-${capability.id.replace(/[^A-Za-z0-9_-]/g, "-")}`;

  useEffect(() => {
    function updateClipped(): void {
      const description = descriptionRef.current;
      if (!description) {
        setClipped(false);
        return;
      }
      setClipped(description.scrollWidth > description.clientWidth || description.scrollHeight > description.clientHeight + 1);
    }
    updateClipped();
    window.addEventListener("resize", updateClipped);
    return () => window.removeEventListener("resize", updateClipped);
  }, [capability.description]);

  function onKeyDown(event: ReactKeyboardEvent<HTMLDivElement>): void {
    if (!clipped) return;
    if (event.key === "Escape") {
      event.stopPropagation();
      setOpen(false);
      return;
    }
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      setOpen((current) => !current);
    }
  }

  const show = clipped && open;
  return (
    <div
      className="plugin-capability-description-wrap"
      tabIndex={clipped ? 0 : undefined}
      role={clipped ? "button" : undefined}
      aria-expanded={clipped ? show : undefined}
      aria-describedby={show ? popoverId : undefined}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
      }}
      onKeyDown={onKeyDown}
    >
      <p ref={descriptionRef} className="plugin-capability-description">
        {capability.description}
      </p>
      {clipped && <span className="plugin-capability-description-affordance" aria-hidden="true">More</span>}
      {show && (
        <span className="plugin-capability-description-popover" id={popoverId} role="tooltip">
          <strong>{capability.displayName ?? capability.name}</strong>
          <span>{capability.description}</span>
          <em>{pluginCapabilityDescriptionMetadata(capability).join(" · ")}</em>
        </span>
      )}
    </div>
  );
}

export function pluginCapabilityDescriptionMetadata(capability: AmbientPluginCapabilitySummary): string[] {
  return [
    capability.pluginDisplayName ?? capability.pluginName,
    formatAmbientAvailability(capability.availability),
    formatAmbientCapabilityKind(capability.kind),
    formatAmbientPluginSourceKind(capability.sourceKind),
    capability.serverName ? `MCP ${capability.serverName}` : undefined,
    capability.connectorId ? `Connector ${capability.connectorId}` : undefined,
    capability.toolName ? `Tool ${capability.toolName}` : undefined,
  ].filter((item): item is string => Boolean(item));
}
