import { useState } from "react";

import type {
  AmbientPluginAuthAccountSummary,
  AmbientPluginRegistry,
  WorkflowArtifactSummary,
  WorkflowConnectorDataRetention,
  WorkflowConnectorManifestGrant,
  WorkflowModelCallRecord,
  WorkflowPluginCapabilityGrant,
  WorkflowRunEvent,
} from "../../shared/types";
import {
  workflowConnectorAccountOptions,
  workflowConnectorConsentSummary,
  workflowModelCallReviewSummary,
} from "./automationUiModel";
import { AutomationHeadingLabel } from "./AutomationsHeading";
import {
  workflowAmbientCliCallSummaries,
  workflowAmbientCliCapabilityRows,
  workflowConnectorCallSummaries,
  workflowRunEventSummaryCards,
  workflowStepSummaries,
} from "./workflowUiModel";
import { workflowPluginRequirementRows } from "./pluginUiModel";

const connectorGrantsTooltip =
  "Connector Grants show which external data sources, scopes, operations, and retention policy the workflow is allowed to use.";

export function workflowConnectorAccountsByConnector(
  registry?: Pick<AmbientPluginRegistry, "capabilities">,
): Record<string, AmbientPluginAuthAccountSummary[]> {
  const accounts: Record<string, AmbientPluginAuthAccountSummary[]> = {};
  for (const capability of registry?.capabilities ?? []) {
    if (capability.kind !== "app" || !capability.connectorId || !capability.authAccounts?.length) continue;
    accounts[capability.connectorId] = [...(accounts[capability.connectorId] ?? []), ...capability.authAccounts];
  }
  return accounts;
}

export function WorkflowConnectorGrantList({
  connectors,
  connectorAccounts,
  compact = false,
  disabled = false,
  onAccountChange,
  onRetentionChange,
  onRemoveScope,
  onReject,
}: {
  connectors?: WorkflowConnectorManifestGrant[];
  connectorAccounts?: Record<string, AmbientPluginAuthAccountSummary[]>;
  compact?: boolean;
  disabled?: boolean;
  onAccountChange?: (connector: WorkflowConnectorManifestGrant, nextAccountId: string) => void;
  onRetentionChange?: (connector: WorkflowConnectorManifestGrant, dataRetention: WorkflowConnectorDataRetention) => void;
  onRemoveScope?: (connector: WorkflowConnectorManifestGrant, scope: string) => void;
  onReject?: (connector: WorkflowConnectorManifestGrant) => void;
}) {
  const [accountDrafts, setAccountDrafts] = useState<Record<string, string>>({});
  if (!connectors?.length) return null;
  const summaries = connectors.map((connector) => ({ connector, summary: workflowConnectorConsentSummary(connector) }));
  return (
    <div className={`workflow-connector-list${compact ? " compact" : ""}`}>
      {!compact && <AutomationHeadingLabel tooltip={connectorGrantsTooltip}>Connector Consent</AutomationHeadingLabel>}
      {summaries.map(({ connector, summary }) => {
        const accountOptions = workflowConnectorAccountOptions(connectorAccounts?.[connector.connectorId] ?? []);
        const accountDraftKey = `${connector.connectorId}:${connector.accountId ?? ""}`;
        const draftedAccountId = accountDrafts[accountDraftKey];
        const currentAccountOption = accountOptions.find((option) => option.value === connector.accountId);
        const selectedAccountId =
          draftedAccountId && accountOptions.some((option) => option.value === draftedAccountId)
            ? draftedAccountId
            : (currentAccountOption?.value ?? accountOptions[0]?.value ?? "");
        const accountChanged = Boolean(selectedAccountId) && selectedAccountId !== (connector.accountId ?? "");
        return (
          <div className="workflow-connector-row" key={`${summary.connectorId}-${summary.accountLabel}`}>
            <strong>{summary.connectorLabel}</strong>
            <div className="workflow-connector-meta">
              <span>{summary.accountLabel}</span>
              <span>{summary.accountStatusLabel}</span>
              <span>{summary.authStatusLabel}</span>
              <span>{summary.scopeLabel}</span>
              <span>{summary.operationLabel}</span>
              <span>{summary.sideEffectLabel}</span>
              <span>{summary.retentionLabel}</span>
              <span>{summary.rateLimitLabel}</span>
              <span>{summary.syncPolicyLabel}</span>
              <span>{summary.reviewPolicyLabel}</span>
            </div>
            {((onAccountChange && accountOptions.length > 0) || (onRetentionChange && summary.retentionDowngradeOptions.length > 0) || onRemoveScope || onReject) && (
              <div className="task-heading-actions">
                {onAccountChange && accountOptions.length > 0 && (
                  <div className="workflow-connector-account-control">
                    <select
                      aria-label={`Account for ${summary.connectorId}`}
                      value={selectedAccountId}
                      onChange={(event) => setAccountDrafts((current) => ({ ...current, [accountDraftKey]: event.target.value }))}
                    >
                      {accountOptions.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      className="panel-button mini"
                      disabled={disabled || !accountChanged}
                      onClick={() => onAccountChange(connector, selectedAccountId)}
                    >
                      Use account
                    </button>
                  </div>
                )}
                {onRetentionChange &&
                  summary.retentionDowngradeOptions.map((option) => (
                    <button
                      type="button"
                      key={`${summary.connectorId}-${option.value}`}
                      className="panel-button mini"
                      disabled={disabled}
                      onClick={() => onRetentionChange(connector, option.value)}
                    >
                      {option.label}
                    </button>
                  ))}
                {onRemoveScope &&
                  summary.scopeRemovalOptions.map((option) => (
                    <button
                      type="button"
                      key={`${summary.connectorId}-${option.value}`}
                      className="panel-button mini danger"
                      disabled={disabled}
                      onClick={() => onRemoveScope(connector, option.value)}
                    >
                      {option.label}
                    </button>
                  ))}
                {onReject && (
                  <button type="button" className="panel-button mini danger" disabled={disabled} onClick={() => onReject(connector)}>
                    {summary.rejectActionLabel}
                  </button>
                )}
              </div>
            )}
            {!compact && (
              <>
                <p className="panel-note">{summary.samplePreviewLabel}</p>
                <p className="panel-note">{summary.dataHandlingLabel}</p>
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}

export function WorkflowPluginCapabilityList({
  capabilities,
  registry,
  compact = false,
}: {
  capabilities?: WorkflowPluginCapabilityGrant[];
  registry?: AmbientPluginRegistry;
  compact?: boolean;
}) {
  if (!capabilities?.length) return null;
  const rows = workflowPluginRequirementRows(capabilities, registry);
  return (
    <div className={`workflow-connector-list${compact ? " compact" : ""}`}>
      {!compact && <AutomationHeadingLabel tooltip="Plugin capabilities this workflow requires before it can run.">Plugin Requirements</AutomationHeadingLabel>}
      {rows.map((capability) => (
        <div className={`workflow-connector-row${capability.blocked ? " blocked" : ""}`} key={capability.capabilityId}>
          <strong>{capability.pluginName}</strong>
          <div className="workflow-connector-meta">
            <span>MCP {capability.serverName}</span>
            <span>Tool {capability.toolName}</span>
            <span>Registered {capability.registeredName}</span>
            <span className={`workflow-requirement-status${capability.blocked ? " blocked" : ""}`}>{capability.availabilityLabel}</span>
          </div>
          {capability.availabilityReason && <p>{capability.availabilityReason}</p>}
        </div>
      ))}
    </div>
  );
}

export function WorkflowAmbientCliCapabilityList({
  capabilities,
  compact = false,
}: {
  capabilities?: WorkflowArtifactSummary["manifest"]["ambientCliCapabilities"];
  compact?: boolean;
}) {
  const rows = workflowAmbientCliCapabilityRows(capabilities);
  if (!rows.length) return null;
  return (
    <div className={`workflow-connector-list${compact ? " compact" : ""}`}>
      {!compact && <AutomationHeadingLabel tooltip="Installed Ambient CLI package commands declared by this workflow manifest.">Ambient CLI requirements</AutomationHeadingLabel>}
      {rows.map((row) => (
        <div className="workflow-connector-row" key={row.id}>
          <strong>{row.operationLabel}</strong>
          <div className="workflow-connector-meta">
            {row.metadataLabels.map((label) => (
              <span key={`${row.id}:${label}`}>{label}</span>
            ))}
          </div>
          <p>{row.grantLabel}</p>
        </div>
      ))}
    </div>
  );
}

export function WorkflowEventList({ events }: { events: WorkflowRunEvent[] }) {
  const cards = workflowRunEventSummaryCards(events, 10);
  const hiddenCount = Math.max(0, events.length - cards.length);
  return (
    <div className="workflow-event-list">
      <div className="workflow-event-list-header">
        <AutomationHeadingLabel tooltip="Runtime events emitted by the workflow compiler and workflow execution engine.">Events</AutomationHeadingLabel>
        <span>{hiddenCount ? `Latest ${cards.length} of ${events.length}` : `${cards.length} event${cards.length === 1 ? "" : "s"}`}</span>
      </div>
      {cards.map((card) => {
        return (
          <article className={`workflow-event-row ${card.tone}`} key={card.id}>
            <div className="workflow-event-row-main">
              <strong>{card.title}</strong>
              <span>{card.detail}</span>
            </div>
            {card.metadataLabels.length > 0 && (
              <div className="workflow-event-row-badges">
                {card.metadataLabels.map((label) => (
                  <span key={`${card.id}:${label}`}>{label}</span>
                ))}
              </div>
            )}
            {card.payloadPreview && <code>{card.payloadPreview}</code>}
          </article>
        );
      })}
    </div>
  );
}

export function WorkflowModelCallList({ modelCalls }: { modelCalls: WorkflowModelCallRecord[] }) {
  return (
    <div className="workflow-model-call-list">
      <AutomationHeadingLabel tooltip="Ambient model calls recorded for this workflow run, including replay key and validation status where available.">Model Calls</AutomationHeadingLabel>
      {modelCalls.length === 0 ? (
        <p className="panel-note">No Ambient model calls recorded for this run.</p>
      ) : (
        modelCalls.slice(0, 5).map((call) => {
          const summary = workflowModelCallReviewSummary(call);
          return (
            <div className="workflow-model-call-row" key={call.id}>
              <strong>{summary.taskLabel}</strong>
              <span>{summary.statusLabel}</span>
              <code>{summary.metadataLabels.join(" | ")}</code>
              <code>{summary.inputPreview}</code>
              {summary.outputPreview && <code>{summary.outputPreview}</code>}
            </div>
          );
        })
      )}
    </div>
  );
}

export function WorkflowConnectorCallList({ events }: { events: WorkflowRunEvent[] }) {
  const connectorCalls = workflowConnectorCallSummaries(events);
  if (connectorCalls.length === 0) return null;
  return (
    <div className="workflow-connector-call-list">
      <AutomationHeadingLabel tooltip="Connector calls recorded for this workflow run, including retention and redaction summaries.">Connector Calls</AutomationHeadingLabel>
      {connectorCalls.slice(-6).map((call) => (
        <div className="workflow-connector-call-row" key={call.id}>
          <strong>{call.operationLabel}</strong>
          <span>{call.statusLabel}</span>
          <code>{call.metadataLabels.join(" | ")}</code>
          {call.retentionSummary && <code>{call.retentionSummary}</code>}
          {call.inputSummary && <code>Input {call.inputSummary}</code>}
          {call.outputSummary && <code>Output {call.outputSummary}</code>}
          {call.errorSummary && <code>Error {call.errorSummary}</code>}
        </div>
      ))}
    </div>
  );
}

export function WorkflowAmbientCliCallList({ events }: { events: WorkflowRunEvent[] }) {
  const ambientCliCalls = workflowAmbientCliCallSummaries(events);
  if (ambientCliCalls.length === 0) return null;
  return (
    <div className="workflow-connector-call-list">
      <AutomationHeadingLabel tooltip="Ambient CLI package commands recorded for this workflow run, including bounded args, stdout previews, and retained artifact references.">
        Ambient CLI Calls
      </AutomationHeadingLabel>
      {ambientCliCalls.slice(-6).map((call) => (
        <div className="workflow-connector-call-row" key={call.id}>
          <strong>{call.operationLabel}</strong>
          <span>{call.statusLabel}</span>
          <code>{call.metadataLabels.join(" | ") || "No additional CLI metadata"}</code>
          {call.argsSummary && <code>Args {call.argsSummary}</code>}
          {call.commandSummary && <code>Command {call.commandSummary}</code>}
          {call.stdoutSummary && <code>{call.stdoutSummary}</code>}
          {call.stderrSummary && <code>{call.stderrSummary}</code>}
          {call.artifactLabels.map((label) => (
            <code key={`${call.id}:${label}`}>{label}</code>
          ))}
          {call.errorSummary && <code>Error {call.errorSummary}</code>}
        </div>
      ))}
    </div>
  );
}

export function WorkflowStepList({ events }: { events: WorkflowRunEvent[] }) {
  const steps = workflowStepSummaries(events);
  if (steps.length === 0) return null;
  return (
    <div className="workflow-step-list">
      <AutomationHeadingLabel tooltip="Workflow step lifecycle derived from runtime step events.">Step Timeline</AutomationHeadingLabel>
      {steps.map((step) => (
        <div className="workflow-step-row" key={step.id}>
          <strong>{step.name}</strong>
          <span>{step.statusLabel}</span>
          <code>{step.metadataLabels.join(" | ") || "No additional step metadata"}</code>
        </div>
      ))}
    </div>
  );
}
