import {
  ChevronDown,
  KeyRound,
  LoaderCircle,
  Play,
  Plug,
  Plus,
  RefreshCw,
  RotateCcw,
  Square,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { ReactNode, useEffect, useState } from "react";
import type { DesktopState, ProviderCatalogSettingsCard } from "../../shared/desktopTypes";
import type { LocalDeepResearchRunHistoryEntry, LocalModelRuntimeLifecycleActionResult } from "../../shared/localRuntimeTypes";
import type { DiagnosticExportHistoryModel } from "./diagnosticExportHistoryUiModel";
import type { LocalDeepResearchDiagnosticItem } from "./localDeepResearchUiModel";
import type { LocalRuntimeEvidenceInspectorModel } from "./localRuntimeEvidenceUiModel";
import type {
  ModelRuntimeCatalogLocalModelsGroup,
  ModelRuntimeCatalogProfileRow,
  ModelRuntimeCatalogRuntimeAction,
  ModelRuntimeCatalogRuntimeRow,
  ModelRuntimeCatalogSettingsModel,
} from "./modelRuntimeCatalogUiModel";
import {
  modelProviderCredentialSaveDraftModel,
  modelProviderEndpointInstallDraftModel,
  type ModelProviderEndpointInstallDraft,
  type ModelProviderOnboardingCard,
  type ModelProviderOnboardingSettingsModel,
} from "./modelProviderOnboardingUiModel";
import { providerCatalogSettingsCardView } from "./pluginUiModel";
import {
  subagentMaturityDesktopDogfoodHistoryModel,
  subagentMaturityLiveHistoryModel,
  subagentMaturityWorkflowJitterReleaseProfileModel,
} from "./subagentMaturityUiModel";
import type { SubagentRepairDiagnosticsModel } from "./subagentRepairDiagnosticsUiModel";
import type { SubagentReplayEvidenceInspectorModel } from "./subagentReplayEvidenceUiModel";

export type ApiKeyStatus = { kind: "info" | "success" | "error"; message: string };

export function localRuntimeLifecycleResultStatusKind(
  status: LocalModelRuntimeLifecycleActionResult["status"],
): ApiKeyStatus["kind"] {
  if (status === "started" || status === "stopped" || status === "restarted") return "success";
  if (status === "ready") return "info";
  return "error";
}

export function firstLine(value: string): string {
  return value.split("\n")[0]?.trim() || value.trim();
}



export function ProviderCatalogSettingsCards({
  cards,
  catalogVersion,
  generatedAt,
  running,
  onStart,
}: {
  cards: ProviderCatalogSettingsCard[];
  catalogVersion: string;
  generatedAt: string;
  running: boolean;
  onStart: (card: ProviderCatalogSettingsCard) => void;
}) {
  const cardViews = cards.map((card) => ({ card, view: providerCatalogSettingsCardView(card) }));
  return (
    <>
      <div className="provider-catalog-settings-grid">
        {cardViews.map(({ card, view }) => (
          <section className={`provider-catalog-settings-card ${view.tone}`} key={card.id}>
            <div className="provider-catalog-settings-card-header">
              <div>
                <strong>{view.title}</strong>
                <span>{card.id}</span>
              </div>
              <button
                type="button"
                className="panel-button mini icon-panel-button"
                disabled={running}
                onClick={() => onStart(card)}
                title={running ? "Wait for the current run to finish before starting provider setup." : view.actionTitle}
              >
                <span className="plug-zap-plus-icon" aria-hidden="true">
                  <Plug size={12} />
                  <Zap size={8} />
                  <Plus size={7} />
                </span>
                {view.actionLabel}
              </button>
            </div>
            <p>{view.subtitle}</p>
            <div className="plugin-badges">
              {view.meta.map((item) => (
                <span key={item}>{item}</span>
              ))}
            </div>
          </section>
        ))}
      </div>
      <small>
        Version {catalogVersion} · generated {formatTimelineTime(generatedAt)}.
      </small>
    </>
  );
}



export function SettingsDisclosure({
  title,
  summary,
  defaultOpen = false,
  tone = "neutral",
  children,
}: {
  title: string;
  summary?: ReactNode;
  defaultOpen?: boolean;
  tone?: "neutral" | "info" | "warning" | "error";
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  useEffect(() => {
    if (defaultOpen) setOpen(true);
  }, [defaultOpen]);
  return (
    <details className={`settings-disclosure ${tone}`} open={open} onToggle={(event) => setOpen(event.currentTarget.open)}>
      <summary>
        <span className="settings-disclosure-title">
          <ChevronDown size={13} />
          <strong>{title}</strong>
        </span>
        {summary && <small>{summary}</small>}
      </summary>
      <div className="settings-disclosure-body">{children}</div>
    </details>
  );
}



type SettingsProviderDiagnosticsModel = {
  statusLabel: string;
  statusTone: "success" | "error" | "info";
  commandLabel?: string;
  cwdLabel?: string;
  errorLabel?: string;
  cacheLabel?: string;
  runtimeLabels?: string[];
  artifactLabels: string[];
  missingHints: string[];
};



export function SettingsProviderDiagnosticsDisclosure({
  title,
  diagnostics,
  onRetry,
  retryDisabled,
}: {
  title: string;
  diagnostics: SettingsProviderDiagnosticsModel;
  onRetry: () => void;
  retryDisabled?: boolean;
}) {
  const hasDetails = Boolean(
      diagnostics.commandLabel ||
      diagnostics.cwdLabel ||
      diagnostics.errorLabel ||
      diagnostics.cacheLabel ||
      diagnostics.runtimeLabels?.length ||
      diagnostics.artifactLabels.length ||
      diagnostics.missingHints.length,
  );
  return (
    <SettingsDisclosure
      title={title}
      summary={diagnostics.statusLabel}
      defaultOpen={diagnostics.statusTone === "error"}
      tone={diagnostics.statusTone === "error" ? "error" : diagnostics.statusTone === "info" ? "info" : "neutral"}
    >
      <div className={`voice-provider-diagnostics provider-diagnostics-detail ${diagnostics.statusTone}`}>
        <div className="voice-provider-diagnostics-header">
          <strong>{diagnostics.statusLabel}</strong>
          <button type="button" className="panel-button mini icon-panel-button" onClick={onRetry} disabled={retryDisabled}>
            <RefreshCw size={12} />
            Retry health
          </button>
        </div>
        {diagnostics.commandLabel && <small>Command: {diagnostics.commandLabel}</small>}
        {diagnostics.cwdLabel && <small>Working directory: {diagnostics.cwdLabel}</small>}
        {diagnostics.errorLabel && <small className="error-text">Error: {diagnostics.errorLabel}</small>}
        {diagnostics.cacheLabel && <small>{diagnostics.cacheLabel}</small>}
        {diagnostics.runtimeLabels?.map((label) => (
          <small key={label}>{label}</small>
        ))}
        {diagnostics.artifactLabels.map((label) => (
          <small key={label}>{label}</small>
        ))}
        {diagnostics.missingHints.length > 0 && (
          <ul>
            {diagnostics.missingHints.map((hint) => (
              <li key={hint}>{hint}</li>
            ))}
          </ul>
        )}
        {!hasDetails && <small>No command diagnostics were reported.</small>}
      </div>
    </SettingsDisclosure>
  );
}

export function ModelRuntimeCatalogDiagnostics({
  model,
  installDraft,
  credentialValue,
  credentialModel,
  credentialBusy,
  credentialStatus,
  installBusy,
  installStatus,
  onInstallDraftChange,
  onCredentialValueChange,
  onSaveCredential,
  onInstallEndpoint,
}: {
  model: ModelRuntimeCatalogSettingsModel;
  installDraft: ModelProviderEndpointInstallDraft;
  credentialValue: string;
  credentialModel: ReturnType<typeof modelProviderCredentialSaveDraftModel>;
  credentialBusy: boolean;
  credentialStatus?: ApiKeyStatus;
  installBusy: boolean;
  installStatus?: ApiKeyStatus;
  onInstallDraftChange: (draft: ModelProviderEndpointInstallDraft) => void;
  onCredentialValueChange: (value: string) => void;
  onSaveCredential: () => void;
  onInstallEndpoint: () => void;
}) {
  const installModel = modelProviderEndpointInstallDraftModel(installDraft);
  return (
    <SettingsDisclosure
      title="Runtime catalog"
      summary={model.statusLabel}
      defaultOpen={model.statusTone === "error"}
      tone={model.statusTone === "error" ? "error" : model.statusTone === "warning" ? "warning" : "neutral"}
    >
      <div className={`voice-provider-diagnostics model-runtime-catalog-diagnostics ${model.statusTone}`}>
        <div className="voice-provider-diagnostics-header">
          <strong>{model.statusLabel}</strong>
          <small>{formatTimelineTime(model.generatedLabel)}</small>
        </div>
        <small>{model.summary}</small>
        <ModelRuntimeCatalogProfileCard title="Selected profile" row={model.selectedProfile} />
        {model.validationRows.length > 0 && (
          <div className="voice-provider-diagnostics error">
            <strong>Validation issues</strong>
            <ul>
              {model.validationRows.map((row) => (
                <li key={row}>{row}</li>
              ))}
            </ul>
          </div>
        )}
        <div className="model-runtime-catalog-profile-groups">
          <ModelRuntimeCatalogProfileGroup title="Main models" rows={model.mainProfileRows} emptyLabel="No main-selectable profiles." />
          <ModelRuntimeCatalogProfileGroup title="Sub-agent models" rows={model.subagentProfileRows} emptyLabel="No sub-agent-selectable profiles." />
          {model.unavailableProfileRows.length > 0 && (
            <ModelRuntimeCatalogProfileGroup title="Unavailable profiles" rows={model.unavailableProfileRows} emptyLabel="No unavailable profiles." />
          )}
          <ModelProviderOnboardingGroup
            model={model.providerOnboarding}
            installDraft={installDraft}
            installModel={installModel}
            credentialValue={credentialValue}
            credentialModel={credentialModel}
            credentialBusy={credentialBusy}
            credentialStatus={credentialStatus}
            installBusy={installBusy}
            installStatus={installStatus}
            onInstallDraftChange={onInstallDraftChange}
            onCredentialValueChange={onCredentialValueChange}
            onSaveCredential={onSaveCredential}
            onInstallEndpoint={onInstallEndpoint}
          />
        </div>
      </div>
    </SettingsDisclosure>
  );
}

export function ModelRuntimeCatalogProfileGroup({
  title,
  rows,
  emptyLabel,
}: {
  title: string;
  rows: ModelRuntimeCatalogProfileRow[];
  emptyLabel: string;
}) {
  return (
    <section className="model-runtime-catalog-profile-group">
      <strong>{title}</strong>
      {rows.length > 0 ? rows.map((row) => (
        <ModelRuntimeCatalogProfileCard key={row.id} row={row} />
      )) : <small>{emptyLabel}</small>}
    </section>
  );
}

function ModelRuntimeCatalogProfileCard({
  title,
  row,
}: {
  title?: string;
  row: ModelRuntimeCatalogProfileRow;
}) {
  return (
    <div className={`voice-provider-diagnostics model-runtime-catalog-profile ${row.tone}`}>
      <div className="voice-provider-diagnostics-header">
        <strong>{title ? `${title}: ${row.label}` : row.label}</strong>
        <small>{row.statusLabel}</small>
      </div>
      <small>{row.providerLabel} · {row.modelId}</small>
      <div className="subagent-thread-badges">
        {row.capabilityLabels.map((label) => (
          <span key={label}>{label}</span>
        ))}
      </div>
      {row.detailLabels.map((label) => (
        <small key={label}>{label}</small>
      ))}
      {row.unavailableReason && <small className="error-text">{row.unavailableReason}</small>}
    </div>
  );
}

export function LocalModelsRuntimeInventory({
  model,
  subagentsEnabled,
  busyActionId,
  onRunLifecycleAction,
}: {
  model: ModelRuntimeCatalogSettingsModel;
  subagentsEnabled: boolean;
  busyActionId?: string;
  onRunLifecycleAction: (row: ModelRuntimeCatalogRuntimeRow, action: ModelRuntimeCatalogRuntimeAction) => void;
}) {
  return (
    <div className={`voice-provider-diagnostics model-runtime-catalog-diagnostics ${model.localRuntimeTone}`}>
      <div className="voice-provider-diagnostics-header">
        <strong>{model.localRuntimeSummary}</strong>
        <small>{model.localModelsSummary}</small>
      </div>
      <div className="model-runtime-catalog-profile-groups">
        {model.localRuntimeGroups.map((group) => (
          <LocalModelsRuntimeGroup
            key={group.id}
            group={group}
            subagentsEnabled={subagentsEnabled}
            busyActionId={busyActionId}
            onRunLifecycleAction={onRunLifecycleAction}
          />
        ))}
      </div>
    </div>
  );
}

function LocalModelsRuntimeGroup({
  group,
  subagentsEnabled,
  busyActionId,
  onRunLifecycleAction,
}: {
  group: ModelRuntimeCatalogLocalModelsGroup;
  subagentsEnabled: boolean;
  busyActionId?: string;
  onRunLifecycleAction: (row: ModelRuntimeCatalogRuntimeRow, action: ModelRuntimeCatalogRuntimeAction) => void;
}) {
  return (
    <section className="model-runtime-catalog-profile-group">
      <div className="voice-provider-diagnostics-header">
        <strong>{group.label}</strong>
        <small>{group.summary}</small>
      </div>
      {group.rows.length > 0 ? group.rows.map((row) => (
        <LocalModelRuntimeCard
          key={row.id}
          row={row}
          subagentsEnabled={subagentsEnabled}
          busyActionId={busyActionId}
          onRunLifecycleAction={onRunLifecycleAction}
        />
      )) : <small>{group.emptyLabel}</small>}
    </section>
  );
}

function LocalModelRuntimeCard({
  row,
  subagentsEnabled,
  busyActionId,
  onRunLifecycleAction,
}: {
  row: ModelRuntimeCatalogRuntimeRow;
  subagentsEnabled: boolean;
  busyActionId?: string;
  onRunLifecycleAction: (row: ModelRuntimeCatalogRuntimeRow, action: ModelRuntimeCatalogRuntimeAction) => void;
}) {
  const commandActions = row.lifecycleActions.filter((action) => action.kind !== "unload");
  const infoActions = row.lifecycleActions.filter((action) => action.kind === "unload");
  return (
    <div className={`voice-provider-diagnostics model-runtime-catalog-profile ${row.tone}`}>
      <div className="voice-provider-diagnostics-header">
        <strong>{row.label}</strong>
        <small>{row.statusLabel}</small>
      </div>
      <small>{row.capabilityLabel} · {row.modelLabel}</small>
      <div className="subagent-thread-badges">
        <span>{row.running ? "Running" : "Stopped"}</span>
        <span>{row.trackingStatusLabel}</span>
        <span>{row.ownerLabel}</span>
      </div>
      <small>{row.memoryLabel}</small>
      {row.endpointLabel && <small>{row.endpointLabel}</small>}
      {row.pidLabel && <small>{row.pidLabel}</small>}
      <div className="subagent-thread-badges">
        {commandActions.map((action) => {
          const buttonBusyId = `${row.id}:${action.kind}`;
          const busy = busyActionId === buttonBusyId;
          const enabled = subagentsEnabled && action.enabled && !busyActionId;
          const Icon = localRuntimeLifecycleActionIcon(action.kind);
          return (
            <button
              type="button"
              key={action.kind}
              className="panel-button mini icon-panel-button"
              disabled={!enabled}
              title={!subagentsEnabled ? "Enable ambient.subagents to control local runtimes." : action.title}
              onClick={() => onRunLifecycleAction(row, action)}
            >
              {busy ? <LoaderCircle size={13} className="spin" /> : <Icon size={13} />}
              {busy ? "Working" : action.label.replace(" disabled", "")}
            </button>
          );
        })}
        {infoActions.map((action) => (
          <span key={action.kind} title={action.title}>
            {action.label}
          </span>
        ))}
        <span>{row.forceTerminationLabel}</span>
      </div>
      {row.blockerSummaryLabel && <small>{row.blockerSummaryLabel}</small>}
      {row.forceConsequenceLabel && <small>{row.forceConsequenceLabel}</small>}
      <small>{row.ordinaryStopAction.title}</small>
      {row.blockerLabels.length > 0 && <small>Blockers: {row.blockerLabels.join(", ")}</small>}
      {row.affectedSubagentLabels.length > 0 && <small>Affected sub-agents: {row.affectedSubagentLabels.join(", ")}</small>}
      {row.detailLabels.map((label) => (
        <small key={label}>{label}</small>
      ))}
    </div>
  );
}

function localRuntimeLifecycleActionIcon(kind: ModelRuntimeCatalogRuntimeAction["kind"]): LucideIcon {
  if (kind === "start") return Play;
  if (kind === "restart") return RotateCcw;
  return Square;
}

function ModelProviderOnboardingGroup({
  model,
  installDraft,
  installModel,
  credentialValue,
  credentialModel,
  credentialBusy,
  credentialStatus,
  installBusy,
  installStatus,
  onInstallDraftChange,
  onCredentialValueChange,
  onSaveCredential,
  onInstallEndpoint,
}: {
  model: ModelProviderOnboardingSettingsModel;
  installDraft: ModelProviderEndpointInstallDraft;
  installModel: ReturnType<typeof modelProviderEndpointInstallDraftModel>;
  credentialValue: string;
  credentialModel: ReturnType<typeof modelProviderCredentialSaveDraftModel>;
  credentialBusy: boolean;
  credentialStatus?: ApiKeyStatus;
  installBusy: boolean;
  installStatus?: ApiKeyStatus;
  onInstallDraftChange: (draft: ModelProviderEndpointInstallDraft) => void;
  onCredentialValueChange: (value: string) => void;
  onSaveCredential: () => void;
  onInstallEndpoint: () => void;
}) {
  return (
    <section className="model-runtime-catalog-profile-group model-provider-onboarding-group">
      <div className="voice-provider-diagnostics-header">
        <strong>Provider onboarding</strong>
        <small>{model.statusLabel}</small>
      </div>
      <small>{model.summary}</small>
      <ModelProviderEndpointInstallForm
        model={model}
        draft={installDraft}
        installModel={installModel}
        credentialValue={credentialValue}
        credentialModel={credentialModel}
        credentialBusy={credentialBusy}
        credentialStatus={credentialStatus}
        busy={installBusy}
        status={installStatus}
        onDraftChange={onInstallDraftChange}
        onCredentialValueChange={onCredentialValueChange}
        onSaveCredential={onSaveCredential}
        onInstall={onInstallEndpoint}
      />
      {model.cards.map((card) => (
        <ModelProviderOnboardingCardView key={card.id} card={card} />
      ))}
    </section>
  );
}

function ModelProviderEndpointInstallForm({
  model,
  draft,
  installModel,
  credentialValue,
  credentialModel,
  credentialBusy,
  credentialStatus,
  busy,
  status,
  onDraftChange,
  onCredentialValueChange,
  onSaveCredential,
  onInstall,
}: {
  model: ModelProviderOnboardingSettingsModel;
  draft: ModelProviderEndpointInstallDraft;
  installModel: ReturnType<typeof modelProviderEndpointInstallDraftModel>;
  credentialValue: string;
  credentialModel: ReturnType<typeof modelProviderCredentialSaveDraftModel>;
  credentialBusy: boolean;
  credentialStatus?: ApiKeyStatus;
  busy: boolean;
  status?: ApiKeyStatus;
  onDraftChange: (draft: ModelProviderEndpointInstallDraft) => void;
  onCredentialValueChange: (value: string) => void;
  onSaveCredential: () => void;
  onInstall: () => void;
}) {
  const installableCards = model.cards.filter((card) => card.endpointInstallable);
  return (
    <div className={`voice-provider-diagnostics model-provider-endpoint-install ${installModel.canInstall ? "info" : "warning"}`}>
      <div className="voice-provider-diagnostics-header">
        <strong>Endpoint probe</strong>
        <small>{installModel.statusLabel}</small>
      </div>
      <div className="settings-mini-row">
        <label className="setting-field">
          <span>Template</span>
          <select
            className="settings-select compact"
            value={draft.templateId}
            onChange={(event) => onDraftChange({ ...draft, templateId: event.target.value })}
          >
            {installableCards.map((card) => (
              <option key={card.id} value={card.id}>{card.label}</option>
            ))}
          </select>
        </label>
        <label className="setting-field">
          <span>Model ID</span>
          <input
            className="panel-input"
            value={draft.modelId}
            onChange={(event) => onDraftChange({ ...draft, modelId: event.target.value })}
            placeholder="provider/model"
          />
        </label>
      </div>
      <label className="setting-field">
        <span>Endpoint URL</span>
        <input
          className="panel-input"
          value={draft.baseUrl}
          onChange={(event) => onDraftChange({ ...draft, baseUrl: event.target.value })}
          placeholder="https://provider.example"
        />
      </label>
      <div className="settings-mini-row">
        <label className="setting-field">
          <span>Credential</span>
          <input
            className="panel-input"
            type="password"
            value={credentialValue}
            onChange={(event) => onCredentialValueChange(event.target.value)}
            placeholder="Stored in Settings"
            autoComplete="off"
            spellCheck={false}
          />
        </label>
        <label className="setting-field">
          <span>Credential label</span>
          <input
            className="panel-input"
            value={draft.credentialLabel}
            onChange={(event) => onDraftChange({ ...draft, credentialLabel: event.target.value })}
            placeholder="Desktop secret request"
          />
        </label>
      </div>
      {credentialModel.validationRows.length > 0 && (
        <ul>
          {credentialModel.validationRows.map((row) => (
            <li key={row}>{row}</li>
          ))}
        </ul>
      )}
      {credentialStatus && <small className={credentialStatus.kind === "error" ? "error-text" : undefined}>{credentialStatus.message}</small>}
      <button
        type="button"
        className="panel-button mini icon-panel-button"
        onClick={onSaveCredential}
        disabled={credentialBusy || !credentialModel.canSave}
        title={credentialModel.actionLabel}
      >
        {credentialBusy ? <LoaderCircle size={13} className="spin" /> : <KeyRound size={13} />}
        {credentialBusy ? "Saving" : credentialModel.actionLabel}
      </button>
      <label className="setting-field">
        <span>Managed credential ref</span>
        <input
          className="panel-input"
          value={draft.managedSecretRef}
          onChange={(event) => onDraftChange({ ...draft, managedSecretRef: event.target.value })}
          placeholder="ambient-secret-ref:v1:..."
          spellCheck={false}
        />
      </label>
      <div className="settings-mini-row">
        <label className="setting-field">
          <span>Provider ID</span>
          <input
            className="panel-input"
            value={draft.providerId}
            onChange={(event) => onDraftChange({ ...draft, providerId: event.target.value })}
            placeholder="optional"
          />
        </label>
        <label className="setting-field">
          <span>Provider label</span>
          <input
            className="panel-input"
            value={draft.providerLabel}
            onChange={(event) => onDraftChange({ ...draft, providerLabel: event.target.value })}
            placeholder="optional"
          />
        </label>
      </div>
      <div className="settings-mini-row">
        <label className="setting-field">
          <span>Model label</span>
          <input
            className="panel-input"
            value={draft.modelLabel}
            onChange={(event) => onDraftChange({ ...draft, modelLabel: event.target.value })}
            placeholder="optional"
          />
        </label>
        <label className="setting-field">
          <span>Reliability samples</span>
          <input
            className="settings-memory-input"
            type="number"
            min={1}
            max={10}
            step={1}
            value={draft.reliabilitySampleCount}
            onChange={(event) => onDraftChange({ ...draft, reliabilitySampleCount: Number.parseInt(event.target.value, 10) || 1 })}
          />
        </label>
      </div>
      <label className="setting-toggle">
        <input
          type="checkbox"
          checked={draft.enabled}
          onChange={(event) => onDraftChange({ ...draft, enabled: event.target.checked })}
        />
        <span>Enable after successful probe</span>
      </label>
      {installModel.validationRows.length > 0 && (
        <ul>
          {installModel.validationRows.map((row) => (
            <li key={row}>{row}</li>
          ))}
        </ul>
      )}
      {status && <small className={status.kind === "error" ? "error-text" : undefined}>{status.message}</small>}
      <button
        type="button"
        className="panel-button mini icon-panel-button primary"
        onClick={onInstall}
        disabled={busy || !installModel.canInstall}
        title={installModel.actionLabel}
      >
        {busy ? <LoaderCircle size={13} className="spin" /> : <Plug size={13} />}
        {busy ? "Probing" : installModel.actionLabel}
      </button>
    </div>
  );
}

function ModelProviderOnboardingCardView({ card }: { card: ModelProviderOnboardingCard }) {
  return (
    <div className={`voice-provider-diagnostics model-runtime-catalog-profile model-provider-onboarding-card ${card.tone}`}>
      <div className="voice-provider-diagnostics-header">
        <strong>{card.label}</strong>
        <small>{card.kindLabel}</small>
      </div>
      <small>{card.compatibilityLabel} · {card.secretFlowLabel}</small>
      <div className="subagent-thread-badges">
        {card.safetyLabels.map((label) => (
          <span key={label}>{label}</span>
        ))}
      </div>
      <small>{card.endpointLabel}</small>
      <small>{card.actionLabel}</small>
      <small>Main probes: {card.requiredMainProbeLabels.join(", ")}</small>
      <small>Sub-agent probes: {card.requiredSubagentProbeLabels.join(", ")}</small>
      {card.notes.map((note) => (
        <small key={note}>{note}</small>
      ))}
    </div>
  );
}



export function SubagentMaturityDiagnostics({
  maturity,
  evidence,
}: {
  maturity: DesktopState["subagentMaturity"];
  evidence: DesktopState["subagentMaturityEvidence"];
}) {
  const tone = maturity.defaultCanBeEnabled ? "success" : "warning";
  const statusLabel = maturity.defaultCanBeEnabled ? "Ready to graduate" : `${maturity.blockedGateIds.length} gate${maturity.blockedGateIds.length === 1 ? "" : "s"} blocked`;
  const latestEvidence = [...evidence]
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt) || right.createdAt.localeCompare(left.createdAt))
    .slice(0, 6);
  const liveHistory = subagentMaturityLiveHistoryModel(maturity);
  const desktopDogfoodHistory = subagentMaturityDesktopDogfoodHistoryModel(maturity);
  const workflowJitterReleaseProfile = subagentMaturityWorkflowJitterReleaseProfileModel(maturity);
  return (
    <SettingsDisclosure
      title="Maturity gates"
      summary={statusLabel}
      defaultOpen={!maturity.defaultCanBeEnabled}
      tone={maturity.defaultCanBeEnabled ? "neutral" : "warning"}
    >
      <div className={`voice-provider-diagnostics subagent-maturity-diagnostics ${tone}`}>
        <div className="voice-provider-diagnostics-header">
          <strong>{statusLabel}</strong>
          <small>{maturity.status}</small>
        </div>
        <small>{maturity.summary}</small>
        <small>Live history: {liveHistory.statusLabel}</small>
        <ul className="subagent-maturity-evidence-list">
          {liveHistory.rows.map((row) => (
            <li key={row.id}>
              <strong>{row.label}</strong>: {row.value}
            </li>
          ))}
        </ul>
        <small>Desktop dogfood history: {desktopDogfoodHistory.statusLabel}</small>
        <ul className="subagent-maturity-evidence-list">
          {desktopDogfoodHistory.rows.map((row) => (
            <li key={row.id}>
              <strong>{row.label}</strong>: {row.value}
            </li>
          ))}
        </ul>
        <small>Workflow jitter release profile: {workflowJitterReleaseProfile.statusLabel}</small>
        <ul className="subagent-maturity-evidence-list">
          {workflowJitterReleaseProfile.rows.map((row) => (
            <li key={row.id}>
              <strong>{row.label}</strong>: {row.value}
            </li>
          ))}
        </ul>
        <ul>
          {maturity.gates.map((gate) => (
            <li key={gate.id}>
              <strong>{gate.label}</strong>: {gate.actual}
              {gate.status !== "passed" ? `; required: ${gate.required}` : ""}
              {gate.detail ? `; ${gate.detail}` : ""}
            </li>
          ))}
        </ul>
        <small>Maturity evidence</small>
        {latestEvidence.length > 0 ? (
          <>
            <ul className="subagent-maturity-evidence-list">
              {latestEvidence.map((item) => (
                <li key={item.id}>
                  <strong>{item.kind.replace(/_/g, " ")}</strong>: {item.status} at {formatTimelineTime(item.updatedAt)}
                  {item.runId ? `; run ${item.runId}` : ""}
                  {item.artifactPath ? `; artifact ${item.artifactPath}` : ""}
                </li>
              ))}
            </ul>
            {evidence.length > latestEvidence.length && <small>{evidence.length - latestEvidence.length} older evidence item{evidence.length - latestEvidence.length === 1 ? "" : "s"} hidden.</small>}
          </>
        ) : (
          <small>No maturity evidence recorded.</small>
        )}
      </div>
    </SettingsDisclosure>
  );
}

export function SubagentRepairDiagnostics({ model }: { model: SubagentRepairDiagnosticsModel }) {
  return (
    <SettingsDisclosure
      title="Repair diagnostics"
      summary={model.statusLabel}
      defaultOpen={model.statusTone !== "success"}
      tone={model.statusTone === "danger" ? "error" : model.statusTone === "warning" ? "warning" : "neutral"}
    >
      <div className={`voice-provider-diagnostics subagent-maturity-diagnostics ${model.statusTone}`}>
        <div className="voice-provider-diagnostics-header">
          <strong>{model.statusLabel}</strong>
          <small>{model.summary}</small>
        </div>
        {model.badges.length > 0 && (
          <div className="subagent-thread-badges">
            {model.badges.map((badge) => (
              <span key={badge}>{badge}</span>
            ))}
          </div>
        )}
        {model.affectedRows.length > 0 && (
          <dl className="subagent-thread-details">
            {model.affectedRows.map((row) => (
              <div key={row.label}>
                <dt>{row.label}</dt>
                <dd title={row.value}>{row.value}</dd>
              </div>
            ))}
          </dl>
        )}
        {model.issueGroups.length > 0 && (
          <dl className="subagent-thread-details">
            {model.issueGroups.map((group) => (
              <div key={group.label}>
                <dt>{group.label}</dt>
                <dd>{group.value}</dd>
              </div>
            ))}
          </dl>
        )}
        {model.issueRows.length > 0 ? (
          <ul className="subagent-maturity-evidence-list">
            {model.issueRows.map((issue) => (
              <li key={issue.key}>
                <strong>{issue.categoryLabel}: {issue.title}</strong>: {issue.detail}
                {issue.actionLabel ? `; ${issue.actionLabel}` : ""}
                {issue.meta ? `; ${issue.meta}` : ""}
              </li>
            ))}
          </ul>
        ) : (
          <small>No repair issues recorded.</small>
        )}
      </div>
    </SettingsDisclosure>
  );
}

export function SubagentReplayEvidenceDiagnostics({ model }: { model: SubagentReplayEvidenceInspectorModel }) {
  const rowGroups = [
    { label: "Child threads", rows: model.childThreadRows },
    { label: "Runtime events", rows: model.runtimeEventRows },
    { label: "Persisted events", rows: model.persistedEventRows },
    { label: "Parent mailbox events", rows: model.parentMailboxRows },
    { label: "Callable workflow tasks", rows: model.callableWorkflowRows },
    { label: "Transcript", rows: model.transcriptRows },
    { label: "Lifecycle edges", rows: model.lifecycleEdgeRows },
    { label: "Restart repair", rows: model.restartRepairRows },
  ].filter((group) => group.rows.length > 0);
  const visibleRowLimit = 5;
  return (
    <SettingsDisclosure
      title="Replay evidence"
      summary={model.statusLabel}
      defaultOpen={model.statusTone !== "success"}
      tone={model.statusTone === "danger" ? "error" : model.statusTone === "warning" ? "warning" : "neutral"}
    >
      <div className={`voice-provider-diagnostics subagent-maturity-diagnostics ${model.statusTone}`}>
        <div className="voice-provider-diagnostics-header">
          <strong>{model.statusLabel}</strong>
          <small>{model.summary}</small>
        </div>
        {model.badges.length > 0 && (
          <div className="subagent-thread-badges">
            {model.badges.map((badge) => (
              <span key={badge}>{badge}</span>
            ))}
          </div>
        )}
        {model.countsRows.length > 0 && (
          <dl className="subagent-thread-details">
            {model.countsRows.map((row) => (
              <div key={row.label}>
                <dt>{row.label}</dt>
                <dd>{row.value}</dd>
              </div>
            ))}
          </dl>
        )}
        {rowGroups.length > 0 ? (
          rowGroups.map((group) => {
            const visibleRows = group.rows.slice(0, visibleRowLimit);
            return (
              <div key={group.label} className="subagent-replay-evidence-group">
                <small>{group.label}</small>
                <ul className="subagent-maturity-evidence-list">
                  {visibleRows.map((row) => (
                    <li key={row.key}>
                      <strong>{row.title}</strong>: {row.detail}
                      {row.meta ? `; ${row.meta}` : ""}
                    </li>
                  ))}
                </ul>
                {group.rows.length > visibleRows.length && (
                  <small>{group.rows.length - visibleRows.length} older {group.label.toLowerCase()} row{group.rows.length - visibleRows.length === 1 ? "" : "s"} hidden.</small>
                )}
              </div>
            );
          })
        ) : (
          <small>Export diagnostics to inspect child replay timelines.</small>
        )}
      </div>
    </SettingsDisclosure>
  );
}

export function LocalRuntimeEvidenceDiagnostics({ model }: { model: LocalRuntimeEvidenceInspectorModel }) {
  const rowGroups = [
    { label: "Runtime rows", rows: model.runtimeRows },
    { label: "Active owners", rows: model.ownerRows },
    { label: "Blocked actions", rows: model.blockedActionRows },
    { label: "Next safe actions", rows: model.nextSafeActionRows },
    { label: "Memory evidence", rows: model.memoryRows },
  ].filter((group) => group.rows.length > 0);
  const visibleRowLimit = 5;
  return (
    <SettingsDisclosure
      title="Local runtime evidence"
      summary={model.statusLabel}
      defaultOpen={model.statusTone !== "success"}
      tone={model.statusTone === "danger" ? "error" : model.statusTone === "warning" ? "warning" : "neutral"}
    >
      <div className={`voice-provider-diagnostics subagent-maturity-diagnostics ${model.statusTone}`}>
        <div className="voice-provider-diagnostics-header">
          <strong>{model.statusLabel}</strong>
          <small>{model.summary}</small>
        </div>
        {model.badges.length > 0 && (
          <div className="subagent-thread-badges">
            {model.badges.map((badge) => (
              <span key={badge}>{badge}</span>
            ))}
          </div>
        )}
        {model.countsRows.length > 0 && (
          <dl className="subagent-thread-details">
            {model.countsRows.map((row) => (
              <div key={row.label}>
                <dt>{row.label}</dt>
                <dd>{row.value}</dd>
              </div>
            ))}
          </dl>
        )}
        {rowGroups.length > 0 ? (
          rowGroups.map((group) => {
            const visibleRows = group.rows.slice(0, visibleRowLimit);
            return (
              <div key={group.label} className="subagent-replay-evidence-group local-runtime-evidence-group">
                <small>{group.label}</small>
                <ul className="subagent-maturity-evidence-list">
                  {visibleRows.map((row) => (
                    <li key={row.key}>
                      <strong>{row.title}</strong>: {row.detail}
                      {row.meta ? `; ${row.meta}` : ""}
                    </li>
                  ))}
                </ul>
                {group.rows.length > visibleRows.length && (
                  <small>{group.rows.length - visibleRows.length} older {group.label.toLowerCase()} row{group.rows.length - visibleRows.length === 1 ? "" : "s"} hidden.</small>
                )}
              </div>
            );
          })
        ) : (
          <small>Export diagnostics to inspect local runtime leases, blockers, and memory evidence.</small>
        )}
      </div>
    </SettingsDisclosure>
  );
}

export function DiagnosticExportHistory({
  model,
  onSelect,
}: {
  model: DiagnosticExportHistoryModel;
  onSelect: (id: string) => void;
}) {
  return (
    <SettingsDisclosure
      title="Recent diagnostic exports"
      summary={model.summary}
      defaultOpen={model.rows.length > 1}
    >
      <div className="diagnostic-export-history-list">
        {model.rows.map((row) => (
          <button
            key={row.id}
            type="button"
            className={`diagnostic-export-history-row ${row.selected ? "selected" : ""}`}
            onClick={() => onSelect(row.id)}
            title={row.path}
          >
            <span>
              <strong>{row.label}</strong>
              <small>{row.detail}</small>
            </span>
            <span className="diagnostic-export-history-statuses">
              <small className={`diagnostic-export-history-status ${row.replayTone}`}>{row.replayStatus}</small>
              <small className={`diagnostic-export-history-status ${row.localRuntimeTone}`}>{row.localRuntimeStatus}</small>
            </span>
          </button>
        ))}
      </div>
    </SettingsDisclosure>
  );
}



export function LocalDeepResearchDiagnosticsList({
  diagnostics,
}: {
  diagnostics: readonly LocalDeepResearchDiagnosticItem[];
}) {
  if (!diagnostics.length) return null;
  return (
    <div className={`voice-provider-diagnostics ${diagnostics.some((diagnostic) => diagnostic.severity === "error") ? "error" : "warning"}`}>
      <strong>Local Deep Research diagnostics</strong>
      {diagnostics.map((diagnostic) => (
        <div key={`${diagnostic.code}:${diagnostic.detail}`} className="voice-provider-cache-activity">
          <small>
            {diagnostic.title} · {diagnostic.code}
          </small>
          <small>{diagnostic.detail}</small>
          <small>{diagnostic.nextAction}</small>
        </div>
      ))}
    </div>
  );
}



export function LocalDeepResearchRunHistoryList({
  entries,
  truncated,
  onOpen,
  onReveal,
}: {
  entries: readonly LocalDeepResearchRunHistoryEntry[];
  truncated: boolean;
  onOpen: (path: string) => void;
  onReveal: (path: string) => void;
}) {
  if (!entries.length) return <small>No Local Deep Research run artifacts yet.</small>;
  return (
    <div className="voice-provider-cache-activity-list">
      {entries.map((entry) => (
        <div key={entry.id} className="voice-provider-cache-activity">
          <small>
            <strong>{entry.status}</strong> · {formatTimelineTime(entry.createdAt)} · {entry.modelProfileId ?? "unknown model"} · {entry.toolCallCount} tool call{entry.toolCallCount === 1 ? "" : "s"}
          </small>
          <small>{entry.question}</small>
          {entry.finalTextPreview && <small>{entry.finalTextPreview}</small>}
          {entry.error && <small className="error-text">{entry.error}</small>}
          <small>
            Search: {entry.providerSnapshot?.searchOrder.join(" -> ") || "none"} · Fetch: {entry.providerSnapshot?.fetchOrder.join(" -> ") || "none"}
          </small>
          <span className="button-row">
            {entry.markdownPath && (
              <button type="button" className="panel-button mini" onClick={() => onOpen(entry.markdownPath!)}>
                Open report
              </button>
            )}
            <button type="button" className="panel-button mini" onClick={() => onOpen(entry.jsonPath)}>
              Open JSON
            </button>
            <button type="button" className="panel-button mini" onClick={() => onReveal(entry.markdownPath ?? entry.jsonPath)}>
              Reveal
            </button>
          </span>
        </div>
      ))}
      {truncated && <small>Showing the newest bounded set of runs.</small>}
    </div>
  );
}



export const MODEL_RUNTIME_PROVIDER_TIMEOUT_OPTIONS_MS = [15_000, 30_000, 45_000, 60_000, 120_000, 300_000, 600_000];



export function formatDurationMs(value: number): string {
  if (value < 1000) return `${Math.round(value).toLocaleString()} ms`;
  return `${(value / 1000).toLocaleString(undefined, { maximumFractionDigits: 1 })}s`;
}



export function formatBytes(value: number): string {
  if (value < 1024) return `${value.toLocaleString()} B`;
  return `${(value / 1024).toLocaleString(undefined, { maximumFractionDigits: 1 })} KB`;
}

export function formatMemoryBytes(value: number): string {
  if (!Number.isFinite(value) || value < 0) return "unknown";
  const gib = value / (1024 ** 3);
  if (gib >= 1) return `${gib.toLocaleString(undefined, { maximumFractionDigits: 1 })} GiB`;
  const mib = value / (1024 ** 2);
  return `${mib.toLocaleString(undefined, { maximumFractionDigits: 0 })} MiB`;
}

export function formatRatioPercent(value: number | undefined): string {
  if (value === undefined || !Number.isFinite(value)) return "unknown";
  return `${Math.round(value * 100).toLocaleString()}%`;
}



export function formatTimelineTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}
