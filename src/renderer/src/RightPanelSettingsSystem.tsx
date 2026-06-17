import { Download, FolderOpen, LoaderCircle, Plug, RefreshCw, Square, Trash2 } from "lucide-react";
import type { Dispatch, ReactNode, SetStateAction } from "react";
import type {
  DesktopState,
  MiniCpmVisionDiagnosticItem,
  MiniCpmVisionSetupAction,
  PermissionAuditEntry,
  ProviderCatalogSettingsCard,
} from "../../shared/types";
import { miniCpmRemoteEndpointReviewChecklistText } from "../../shared/miniCpmRemoteEndpointSecurity";
import type { MiniCpmVisionSetupActionModel, MiniCpmVisionSetupResultModel } from "./miniCpmVisionUiModel";
import type { DiagnosticExportHistoryModel } from "./diagnosticExportHistoryUiModel";
import type { GoogleWorkspaceGrantReviewModel } from "./googleWorkspaceGrantUiModel";
import type {
  PermissionGrantFullAccessReceipt,
  PermissionGrantRegistryModel,
} from "./permissionGrantRegistryUiModel";
import type { LocalRuntimeEvidenceInspectorModel } from "./localRuntimeEvidenceUiModel";
import type { SubagentRepairDiagnosticsModel } from "./subagentRepairDiagnosticsUiModel";
import type { SubagentReplayEvidenceInspectorModel } from "./subagentReplayEvidenceUiModel";
import type { MiniCpmVisionSetupUiState } from "./RightPanel";
import {
  formatPermissionAuditDetail,
  formatPermissionRisk,
  isSandboxFallbackPermissionAudit,
} from "./RightPanelDetailPanels";
import { MiniCpmVisionDiagnosticsList } from "./RightPanelMiniCpmVisionDiagnostics";
import {
  DiagnosticExportHistory,
  LocalRuntimeEvidenceDiagnostics,
  ProviderCatalogSettingsCards,
  SettingsDisclosure,
  SubagentMaturityDiagnostics,
  SubagentRepairDiagnostics,
  SubagentReplayEvidenceDiagnostics,
  formatTimelineTime,
} from "./RightPanelSettingsRuntime";
import type { ApiKeyStatus } from "./RightPanelSettingsRuntime";
import { SettingsRow, SettingsSection } from "./RightPanelSettingsPrimitives";

type SettingsRowVisible = (sectionId: string, rowId: string) => boolean;
type MaybePromise<T = unknown> = T | Promise<T>;
type FullAccessReceiptListComponent = (props: { receipts: PermissionGrantFullAccessReceipt[]; limit?: number }) => ReactNode;

export type RightPanelMediaSettingsSectionProps = {
  state: DesktopState;
  running: boolean;
  settingsRowVisible: SettingsRowVisible;
  miniCpmVisionSetup: MiniCpmVisionSetupUiState;
  miniCpmVisionSetupModel?: MiniCpmVisionSetupResultModel;
  miniCpmVisionRuntimePath: string;
  miniCpmVisionEndpointUrl: string;
  miniCpmVisionActions: MiniCpmVisionSetupActionModel[];
  miniCpmVisionDiagnostics: MiniCpmVisionDiagnosticItem[];
  visualCatalogCards: ProviderCatalogSettingsCard[];
  authoredVideoCatalogCards: ProviderCatalogSettingsCard[];
  onMiniCpmVisionRuntimePathChange: (value: string) => void;
  onMiniCpmVisionEndpointUrlChange: (value: string) => void;
  onSetupMiniCpmVisionProvider: (action: MiniCpmVisionSetupAction) => void;
  startProviderCatalogCardOnboarding: (card: ProviderCatalogSettingsCard) => MaybePromise;
  onMediaPlaybackSettingsChange: (media: DesktopState["settings"]["media"]) => void;
};

export type RightPanelWritingStyleSettingsSectionProps = {
  state: DesktopState;
  running: boolean;
  settingsRowVisible: SettingsRowVisible;
  writingStyleCatalogCards: ProviderCatalogSettingsCard[];
  startProviderCatalogCardOnboarding: (card: ProviderCatalogSettingsCard) => MaybePromise;
};

export function RightPanelWritingStyleSettingsSection({
  state,
  running,
  settingsRowVisible,
  writingStyleCatalogCards,
  startProviderCatalogCardOnboarding,
}: RightPanelWritingStyleSettingsSectionProps) {
  return (
    <SettingsSection
      id="writing-style"
      title="Writing Style"
      description="Reusable writing-style profiles and local style-transfer capability setup."
    >
      {settingsRowVisible("writing-style", "writing-style.catalog") && (
        <SettingsRow
          label="TinyStyler"
          value={`${writingStyleCatalogCards.length} catalog card${writingStyleCatalogCards.length === 1 ? "" : "s"}`}
          description="Launch approval-gated TinyStyler setup from the same Ambient CLI catalog source Pi sees."
        >
          <ProviderCatalogSettingsCards
            cards={writingStyleCatalogCards}
            catalogVersion={state.providerCatalog.catalogVersion}
            generatedAt={state.providerCatalog.generatedAt}
            running={running}
            onStart={(card) => void startProviderCatalogCardOnboarding(card)}
          />
        </SettingsRow>
      )}
    </SettingsSection>
  );
}

export function RightPanelMediaSettingsSection({
  state,
  running,
  settingsRowVisible,
  miniCpmVisionSetup,
  miniCpmVisionSetupModel,
  miniCpmVisionRuntimePath,
  miniCpmVisionEndpointUrl,
  miniCpmVisionActions,
  miniCpmVisionDiagnostics,
  visualCatalogCards,
  authoredVideoCatalogCards,
  onMiniCpmVisionRuntimePathChange,
  onMiniCpmVisionEndpointUrlChange,
  onSetupMiniCpmVisionProvider,
  startProviderCatalogCardOnboarding,
  onMediaPlaybackSettingsChange,
}: RightPanelMediaSettingsSectionProps) {
  return (
<SettingsSection
          id="media-browser"
          title="Media & Vision"
          description="Generated media playback and visual-understanding provider setup."
        >
          {settingsRowVisible("media-browser", "media.minicpm-diagnostics") && (
          <SettingsRow
            label="MiniCPM-V diagnostics"
            value={
              miniCpmVisionSetup.status === "running"
                ? "Working"
                : miniCpmVisionSetupModel?.statusLabel ?? miniCpmVisionSetup.message ?? "Not validated"
            }
            description="Install, validate, repair, or clean up the first-party local visual provider without asking Pi to discover runtime contracts."
          >
            <label className="setting-field">
              <span>llama-server path</span>
              <input
                className="panel-input"
                value={miniCpmVisionRuntimePath}
                onChange={(event) => onMiniCpmVisionRuntimePathChange(event.target.value)}
                placeholder="/path/to/user/RCLI/deps/llama.cpp/build/bin/llama-server"
                disabled={miniCpmVisionSetup.status === "running" || Boolean(miniCpmVisionEndpointUrl.trim())}
              />
              <small>Optional. Leave blank to use PATH, known local installs, or the workspace binding from previous setup. Disabled when using an existing endpoint.</small>
            </label>
            <label className="setting-field">
              <span>Existing local endpoint</span>
              <input
                className="panel-input"
                value={miniCpmVisionEndpointUrl}
                onChange={(event) => onMiniCpmVisionEndpointUrlChange(event.target.value)}
                placeholder="http://127.0.0.1:39217"
                disabled={miniCpmVisionSetup.status === "running"}
              />
              <small>Advanced. Use only for an already-running local OpenAI-compatible MiniCPM endpoint. Remote endpoints are rejected until security review covers {miniCpmRemoteEndpointReviewChecklistText()}.</small>
            </label>
            <div className="panel-action-row">
              {miniCpmVisionActions.map((action) => (
                <button
                  type="button"
                  className={`panel-button mini icon-panel-button ${action.primary ? "primary" : ""} ${action.danger ? "danger" : ""}`}
                  key={action.action}
                  onClick={() => onSetupMiniCpmVisionProvider(action.action)}
                  disabled={miniCpmVisionSetup.status === "running"}
                  title={action.title}
                >
                  {miniCpmVisionSetup.status === "running" && miniCpmVisionSetup.action === action.action ? <LoaderCircle size={12} className="spin" /> : action.action === "uninstall" ? <Trash2 size={12} /> : action.action === "stop" ? <Square size={12} /> : <RefreshCw size={12} />}
                  {miniCpmVisionSetup.status === "running" && miniCpmVisionSetup.action === action.action ? "Working" : action.label}
                </button>
              ))}
            </div>
            {miniCpmVisionSetup.message && (
              <div className={`voice-provider-diagnostics ${miniCpmVisionSetup.status === "error" ? "error" : miniCpmVisionSetupModel?.statusTone ?? "info"}`}>
                <strong>{miniCpmVisionSetupModel?.statusLabel ?? miniCpmVisionSetup.message}</strong>
                {miniCpmVisionSetupModel?.detailLabels.map((label) => (
                  <small key={label}>{label}</small>
                ))}
                {miniCpmVisionSetup.status === "error" && <small className="error-text">{miniCpmVisionSetup.message}</small>}
              </div>
            )}
            <MiniCpmVisionDiagnosticsList diagnostics={miniCpmVisionDiagnostics} />
          </SettingsRow>
          )}
          {settingsRowVisible("media-browser", "media.visual-catalog") && (
          <SettingsRow
            label="Visual analysis providers"
            value={`${visualCatalogCards.length} catalog card${visualCatalogCards.length === 1 ? "" : "s"}`}
            description="Launch an approval-gated visual-understanding setup chat from the same catalog source Pi sees."
          >
            <ProviderCatalogSettingsCards
              cards={visualCatalogCards}
              catalogVersion={state.providerCatalog.catalogVersion}
              generatedAt={state.providerCatalog.generatedAt}
              running={running}
              onStart={(card) => void startProviderCatalogCardOnboarding(card)}
            />
          </SettingsRow>
          )}
          {settingsRowVisible("media-browser", "media.video-catalog") && authoredVideoCatalogCards.length > 0 && (
          <SettingsRow
            label="Authored video providers"
            value={`${authoredVideoCatalogCards.length} catalog card${authoredVideoCatalogCards.length === 1 ? "" : "s"}`}
            description="Launch an approval-gated authored-video setup chat from the same catalog source Pi sees."
          >
            <ProviderCatalogSettingsCards
              cards={authoredVideoCatalogCards}
              catalogVersion={state.providerCatalog.catalogVersion}
              generatedAt={state.providerCatalog.generatedAt}
              running={running}
              onStart={(card) => void startProviderCatalogCardOnboarding(card)}
            />
          </SettingsRow>
          )}
          {settingsRowVisible("media-browser", "media.generated") && (
          <SettingsRow
            label="Generated media"
            value={state.settings.media.generatedMediaAutoplay ? "Autoplay video previews" : "Controls only"}
            description="Images open inline. Audio stays controls-only; video previews can autoplay muted when enabled."
          >
            <label className="setting-toggle">
              <input
                type="checkbox"
                checked={state.settings.media.generatedMediaAutoplay}
                onChange={(event) => onMediaPlaybackSettingsChange({ generatedMediaAutoplay: event.target.checked })}
              />
              <span>Autoplay generated video previews</span>
            </label>
          </SettingsRow>
          )}
        </SettingsSection>
  );
}

export type RightPanelSecuritySettingsSectionProps = {
  state: DesktopState;
  settingsRowVisible: SettingsRowVisible;
  grantRegistry: PermissionGrantRegistryModel;
  sandboxFallbackAuditCount: number;
  permissionGrantError?: string;
  googleGrantReview: GoogleWorkspaceGrantReviewModel;
  permissionGrantRevoking?: string;
  googleGrantBusy?: boolean;
  permissionAuditFilter: "all" | "sandbox-fallback";
  setPermissionAuditFilter: Dispatch<SetStateAction<"all" | "sandbox-fallback">>;
  permissionAuditError?: string;
  visiblePermissionAudit: PermissionAuditEntry[];
  permissionAudit: PermissionAuditEntry[];
  PermissionFullAccessReceiptList: FullAccessReceiptListComponent;
  onOpenApiKey: () => void;
  onOpenPluginCapabilities: () => void;
  onLoadPermissionGrants: () => MaybePromise;
  onRevokePermissionGrantIds: (grantIds: string[], busyKey: string) => MaybePromise;
  onRevokePermissionGrant: (grantId: string) => MaybePromise;
  onLoadPermissionAudit: () => MaybePromise;
};

export function RightPanelSecuritySettingsSection({
  state,
  settingsRowVisible,
  grantRegistry,
  sandboxFallbackAuditCount,
  permissionGrantError,
  googleGrantReview,
  permissionGrantRevoking,
  googleGrantBusy,
  permissionAuditFilter,
  setPermissionAuditFilter,
  permissionAuditError,
  visiblePermissionAudit,
  permissionAudit,
  PermissionFullAccessReceiptList,
  onOpenApiKey,
  onOpenPluginCapabilities,
  onLoadPermissionGrants,
  onRevokePermissionGrantIds,
  onRevokePermissionGrant,
  onLoadPermissionAudit,
}: RightPanelSecuritySettingsSectionProps) {
  return (
<SettingsSection
          id="security-access"
          title="Security & Access"
          description="API key source, browser profile access, Google Workspace grants, persistent permission grants, and recent permission decisions."
          badges={
            <>
              <span className="settings-section-badge">{grantRegistry.activeCount} active</span>
              <span className="settings-section-badge">{grantRegistry.highRiskCount} high risk</span>
              <span className="settings-section-badge">{sandboxFallbackAuditCount} fallback</span>
            </>
          }
        >
          {settingsRowVisible("security-access", "security.api-key") && (
          <SettingsRow
            label={`${state.provider.providerLabel} API key`}
            value={state.provider.source === "missing" ? "Missing" : state.provider.source === "saved" ? "Saved" : "Environment"}
            description={state.provider.debugOverride ? `Debug provider override: ${state.provider.baseUrl}` : undefined}
          >
            <button type="button" className="panel-button" onClick={onOpenApiKey}>
              Set {state.provider.providerLabel} API key
            </button>
          </SettingsRow>
          )}
          {settingsRowVisible("security-access", "security.browser") && (
          <SettingsRow
            label="Browser access"
            value="Isolated profile by default"
            description="Copied Chrome profile access is enabled from the Browser panel."
          />
          )}
          {settingsRowVisible("security-access", "security.google") && (
          <SettingsRow
            label="Google Workspace grants"
            value={
              permissionGrantError
                ? "Unavailable"
                : googleGrantReview.grants.length
                  ? `${googleGrantReview.grants.length} active · ${googleGrantReview.groups.length} account${googleGrantReview.groups.length === 1 ? "" : "s"}`
                  : "No active grants"
            }
            description={
              googleGrantReview.totalAuditCount
                ? `${googleGrantReview.totalAuditCount} visible reuse event${googleGrantReview.totalAuditCount === 1 ? "" : "s"} across Google Workspace methods.`
                : "Add Google accounts from Plugins > Install Capabilities. This section lists dynamic method grants after use."
            }
          >
            <div className="panel-action-row compact">
              <button type="button" className="panel-button mini icon-panel-button" onClick={onOpenPluginCapabilities}>
                <Plug size={13} />
                Open Plugins
              </button>
              <button type="button" className="panel-button mini" onClick={() => void onLoadPermissionGrants()}>
                Refresh
              </button>
              <button
                type="button"
                className="panel-button mini danger"
                disabled={!googleGrantReview.grants.length || Boolean(permissionGrantRevoking)}
                onClick={() => void onRevokePermissionGrantIds(googleGrantReview.grants.map((grant) => grant.id), "google:all")}
                title="Revoke every active Google Workspace dynamic method grant."
              >
                {permissionGrantRevoking === "google:all" ? "Revoking" : "Revoke Google"}
              </button>
            </div>
            {permissionGrantError && <small className="error-text">{permissionGrantError}</small>}
            <SettingsDisclosure
              title="Google grant details"
              summary={
                googleGrantReview.groups.length
                  ? `${googleGrantReview.groups.length} account${googleGrantReview.groups.length === 1 ? "" : "s"} · ${googleGrantReview.totalAuditCount} reuse events`
                  : "No active Google Workspace grants"
              }
              defaultOpen={Boolean(permissionGrantError)}
              tone={permissionGrantError ? "error" : "neutral"}
            >
              <div className="permission-log google-grant-review settings-detail-list">
                {permissionGrantError ? (
                  <p className="panel-note">{permissionGrantError}</p>
                ) : googleGrantReview.groups.length > 0 ? (
                  <>
                    <p className="panel-note">
                      {googleGrantReview.grants.length} active Google grant{googleGrantReview.grants.length === 1 ? "" : "s"} across{" "}
                      {googleGrantReview.groups.length} account{googleGrantReview.groups.length === 1 ? "" : "s"}.
                    </p>
                    {googleGrantReview.groups.map((group) => (
                      <div className="google-grant-account" key={group.accountHint}>
                        <div className="google-grant-account-header">
                          <div>
                            <strong>{group.accountHint}</strong>
                            <span>
                              {group.grants.length} grant{group.grants.length === 1 ? "" : "s"} · {group.services.join(", ")}
                              {group.lastUsedAt ? ` · last used ${formatTimelineTime(group.lastUsedAt)}` : ""}
                            </span>
                          </div>
                          <button
                            type="button"
                            className="panel-button mini danger"
                            disabled={Boolean(permissionGrantRevoking)}
                            onClick={() => void onRevokePermissionGrantIds(group.grants.map((grant) => grant.id), `google:account:${group.accountHint}`)}
                          >
                            {permissionGrantRevoking === `google:account:${group.accountHint}` ? "Revoking" : "Revoke Account"}
                          </button>
                        </div>
                        {group.grants.map((grant) => (
                          <div className="permission-log-row allowed google-grant-row" key={grant.id}>
                            <div>
                              <strong>{grant.methodId}</strong>
                              <span>{grant.sideEffect}</span>
                            </div>
                            <small>
                              {grant.service} · {grant.scopeLabel} · {grant.auditCount} visible reuse event{grant.auditCount === 1 ? "" : "s"}
                              {grant.lastUsedAt ? ` · last used ${formatTimelineTime(grant.lastUsedAt)}` : ""}
                            </small>
                            <code>{grant.provenanceLabel}</code>
                            <button
                              type="button"
                              className="panel-button mini danger"
                              disabled={permissionGrantRevoking === grant.id || googleGrantBusy}
                              onClick={() => void onRevokePermissionGrant(grant.id)}
                            >
                              {permissionGrantRevoking === grant.id ? "Revoking" : "Revoke"}
                            </button>
                          </div>
                        ))}
                      </div>
                    ))}
                  </>
                ) : (
                  <p className="panel-note">No active Google Workspace dynamic method grants yet.</p>
                )}
              </div>
            </SettingsDisclosure>
          </SettingsRow>
          )}
          {settingsRowVisible("security-access", "security.grants") && (
          <SettingsRow
            label="Permission grants"
            value={
              grantRegistry.activeCount
                ? `${grantRegistry.activeCount} active · ${grantRegistry.highRiskCount} high risk`
                : grantRegistry.fullAccessReceiptCount
                  ? `${grantRegistry.fullAccessReceiptCount} full access receipt${grantRegistry.fullAccessReceiptCount === 1 ? "" : "s"}`
                  : "No persistent grants"
            }
            description={grantRegistry.summary}
          >
            <div className="panel-action-row compact">
              <span className="plugin-kind-badge">{grantRegistry.activeCount} active</span>
              <span className="plugin-kind-badge">{grantRegistry.highRiskCount} high risk</span>
              <button type="button" className="panel-button mini" onClick={() => void onLoadPermissionGrants()}>
                Refresh
              </button>
            </div>
            {permissionGrantError && <small className="error-text">{permissionGrantError}</small>}
            <SettingsDisclosure
              title="Persistent grant details"
              summary={`${grantRegistry.groups.length} scope${grantRegistry.groups.length === 1 ? "" : "s"} · ${grantRegistry.totalAuditCount} reuse events`}
              defaultOpen={Boolean(permissionGrantError)}
              tone={permissionGrantError ? "error" : grantRegistry.highRiskCount ? "warning" : "neutral"}
            >
              <div className="permission-log settings-detail-list">
                {permissionGrantError ? (
                  <p className="panel-note">{permissionGrantError}</p>
                ) : grantRegistry.groups.length > 0 || grantRegistry.fullAccessReceipts.length > 0 ? (
                  <>
                    <p className="panel-note">{grantRegistry.summary}</p>
                    <div className="permission-grant-registry">
                      {grantRegistry.groups.map((group) => (
                        <div className={`permission-grant-scope ${group.tone}`} key={group.id}>
                          <div className="permission-grant-scope-header">
                            <div>
                              <strong>{group.scopeLabel}</strong>
                              <span>{group.summary}</span>
                            </div>
                            <button
                              type="button"
                              className="panel-button mini danger"
                              disabled={!group.revokeIds.length || Boolean(permissionGrantRevoking)}
                              title={`Revoke ${group.activeCount} active ${group.scopeLabel.toLowerCase()} grant${group.activeCount === 1 ? "" : "s"}.`}
                              onClick={() => void onRevokePermissionGrantIds(group.revokeIds, `grant-scope:${group.id}`)}
                            >
                              {permissionGrantRevoking === `grant-scope:${group.id}` ? "Revoking" : "Revoke Scope"}
                            </button>
                          </div>
                          {group.rows.slice(0, 8).map((row) => (
                            <div className={`permission-log-row ${row.tone === "blocked" ? "denied" : "allowed"} permission-grant-registry-row`} key={row.id}>
                              <div>
                                <strong>{row.actionLabel}</strong>
                                <span>{row.riskLabel}</span>
                              </div>
                              <small title={row.targetLabel}>{row.targetLabel}</small>
                              <code title={row.impactLabel}>
                                {row.statusLabel} · {row.expiryLabel} · {row.recentUseLabel} · {row.provenanceLabel}
                              </code>
                              <button
                                type="button"
                                className="panel-button mini danger"
                                disabled={permissionGrantRevoking === row.id || !row.active}
                                title={row.impactLabel}
                                onClick={() => void onRevokePermissionGrant(row.id)}
                              >
                                {permissionGrantRevoking === row.id ? "Revoking" : row.active ? "Revoke" : row.statusLabel}
                              </button>
                            </div>
                          ))}
                        </div>
                      ))}
                      <PermissionFullAccessReceiptList receipts={grantRegistry.fullAccessReceipts} limit={8} />
                    </div>
                  </>
                ) : (
                  <p className="panel-note">No persistent permission grants yet.</p>
                )}
              </div>
            </SettingsDisclosure>
          </SettingsRow>
          )}
          {settingsRowVisible("security-access", "security.log") && (
          <SettingsRow
            label="Permission log"
            value={
              permissionAuditError
                ? "Unavailable"
                : `${visiblePermissionAudit.length} visible · ${sandboxFallbackAuditCount} fallback`
            }
            description="Recent permission decisions are collapsed by default unless denied or sandbox-fallback entries need attention."
          >
            <div className="panel-action-row compact">
              <span className="plugin-kind-badge">{sandboxFallbackAuditCount} fallback</span>
              <button
                type="button"
                className={`panel-button mini ${permissionAuditFilter === "all" ? "primary" : ""}`}
                onClick={() => setPermissionAuditFilter("all")}
              >
                All
              </button>
              <button
                type="button"
                className={`panel-button mini ${permissionAuditFilter === "sandbox-fallback" ? "primary" : ""}`}
                disabled={sandboxFallbackAuditCount === 0}
                onClick={() => setPermissionAuditFilter("sandbox-fallback")}
              >
                Fallback only
              </button>
              <button type="button" className="panel-button mini" onClick={() => void onLoadPermissionAudit()}>
                Refresh
              </button>
            </div>
            {permissionAuditError && <small className="error-text">{permissionAuditError}</small>}
            <SettingsDisclosure
              title="Permission log details"
              summary={`${visiblePermissionAudit.length} visible decisions`}
              defaultOpen={Boolean(permissionAuditError || sandboxFallbackAuditCount > 0 || permissionAudit.some((entry) => entry.decision === "denied"))}
              tone={permissionAuditError ? "error" : sandboxFallbackAuditCount > 0 || permissionAudit.some((entry) => entry.decision === "denied") ? "warning" : "neutral"}
            >
              <div className="permission-log settings-detail-list">
                {permissionAuditError ? (
                  <p className="panel-note">{permissionAuditError}</p>
                ) : visiblePermissionAudit.length > 0 ? (
                  visiblePermissionAudit.slice(0, 12).map((entry) => (
                    <div className={`permission-log-row ${entry.decision}`} key={entry.id}>
                      <div>
                        <strong>{entry.decision === "allowed" ? "Allowed" : "Denied"}</strong>
                        <span>{entry.toolName}</span>
                        {isSandboxFallbackPermissionAudit(entry) && <small>Sandbox fallback</small>}
                      </div>
                      <small>{formatPermissionRisk(entry.risk)}</small>
                      {entry.detail && <code title={entry.detail}>{formatPermissionAuditDetail(entry)}</code>}
                    </div>
                  ))
                ) : permissionAuditFilter === "sandbox-fallback" ? (
                  <p className="panel-note">No sandbox fallback permission decisions recorded yet.</p>
                ) : (
                  <p className="panel-note">No permission decisions recorded yet.</p>
                )}
              </div>
            </SettingsDisclosure>
          </SettingsRow>
          )}
        </SettingsSection>
  );
}

export type RightPanelDiagnosticsSettingsSectionProps = {
  settingsRowVisible: SettingsRowVisible;
  diagnosticStatus?: ApiKeyStatus;
  diagnosticBusy: boolean;
  diagnosticExportHistory?: DiagnosticExportHistoryModel;
  selectDiagnosticExportHistoryEntry: (id: string) => void;
  subagentReplayEvidence?: SubagentReplayEvidenceInspectorModel;
  subagentReplayEvidenceValue: string;
  localRuntimeEvidence?: LocalRuntimeEvidenceInspectorModel;
  localRuntimeEvidenceValue: string;
  subagentMaturityValue: string;
  subagentMaturity: DesktopState["subagentMaturity"];
  subagentMaturityEvidence: DesktopState["subagentMaturityEvidence"];
  subagentRepairDiagnostics?: SubagentRepairDiagnosticsModel;
  subagentRepairDiagnosticsValue: string;
  importDiagnostics: () => MaybePromise<void>;
  exportDiagnostics: () => MaybePromise<void>;
};

export function RightPanelDiagnosticsSettingsSection({
  settingsRowVisible,
  diagnosticStatus,
  diagnosticBusy,
  diagnosticExportHistory,
  selectDiagnosticExportHistoryEntry,
  subagentReplayEvidence,
  subagentReplayEvidenceValue,
  localRuntimeEvidence,
  localRuntimeEvidenceValue,
  subagentMaturityValue,
  subagentMaturity,
  subagentMaturityEvidence,
  subagentRepairDiagnostics,
  subagentRepairDiagnosticsValue,
  importDiagnostics,
  exportDiagnostics,
}: RightPanelDiagnosticsSettingsSectionProps) {
  return (
<SettingsSection
          id="diagnostics"
          title="Diagnostics"
          description="Export app diagnostics and review rollout health for guarded features."
          badges={diagnosticStatus ? <span className="settings-section-badge">{diagnosticStatus.kind}</span> : undefined}
        >
          {settingsRowVisible("diagnostics", "diagnostics.export") && (
                <section className="diagnostic-export">
                  <div className="panel-section-heading">
                    <strong>Diagnostics</strong>
                    <div className="panel-action-row compact">
                      <button type="button" className="panel-button mini icon-panel-button" disabled={diagnosticBusy} onClick={() => void importDiagnostics()}>
                        <FolderOpen size={13} />
                        Import
                      </button>
                      <button type="button" className="panel-button mini icon-panel-button" disabled={diagnosticBusy} onClick={() => void exportDiagnostics()}>
                        <Download size={13} />
                        {diagnosticBusy ? "Working" : "Export"}
                      </button>
                    </div>
                  </div>
                  {diagnosticStatus && <p className={`panel-status ${diagnosticStatus.kind}`}>{diagnosticStatus.message}</p>}
                </section>
          )}
          {settingsRowVisible("diagnostics", "diagnostics.export-history") && diagnosticExportHistory && (
          <SettingsRow
            label="Diagnostic export history"
            value={diagnosticExportHistory.summary}
            description="Recent saved and imported diagnostic bundles from this app profile."
          >
            <DiagnosticExportHistory model={diagnosticExportHistory} onSelect={selectDiagnosticExportHistoryEntry} />
          </SettingsRow>
          )}
          {settingsRowVisible("diagnostics", "diagnostics.subagent-replay") && subagentReplayEvidence && (
          <SettingsRow
            label="Sub-agent replay"
            value={subagentReplayEvidenceValue}
            description="Inspectable replay evidence from the selected diagnostic bundle."
          >
            <SubagentReplayEvidenceDiagnostics model={subagentReplayEvidence} />
          </SettingsRow>
          )}
          {settingsRowVisible("diagnostics", "diagnostics.local-runtime-evidence") && localRuntimeEvidence && (
          <SettingsRow
            label="Local runtime evidence"
            value={localRuntimeEvidenceValue}
            description="Inspectable local runtime leases, blockers, and memory evidence from the selected diagnostic bundle."
          >
            <LocalRuntimeEvidenceDiagnostics model={localRuntimeEvidence} />
          </SettingsRow>
          )}
          {settingsRowVisible("diagnostics", "diagnostics.subagent-maturity") && (
          <SettingsRow
            label="Sub-agent maturity"
            value={subagentMaturityValue}
            description="Rollout gates for enabling ambient.subagents by default."
          >
            <SubagentMaturityDiagnostics maturity={subagentMaturity} evidence={subagentMaturityEvidence} />
          </SettingsRow>
          )}
          {settingsRowVisible("diagnostics", "diagnostics.subagent-repair") && subagentRepairDiagnostics && (
          <SettingsRow
            label="Sub-agent repair"
            value={subagentRepairDiagnosticsValue}
            description="Restart and persistence diagnostics for sub-agent child trees."
          >
            <SubagentRepairDiagnostics model={subagentRepairDiagnostics} />
          </SettingsRow>
          )}
        </SettingsSection>
  );
}

export type RightPanelAboutSettingsSectionProps = {
  state: DesktopState;
  settingsRowVisible: SettingsRowVisible;
};

export function RightPanelAboutSettingsSection({
  state,
  settingsRowVisible,
}: RightPanelAboutSettingsSectionProps) {
  return (
<SettingsSection
          id="about"
          title="About"
          description="App build information and third-party acknowledgements."
          badges={<span className="settings-section-badge">{state.app.version}</span>}
        >
          {settingsRowVisible("about", "about.credits") && (
                state.app.thirdPartyCredits.length > 0 ? (
                  <section className="diagnostic-export">
                    <div className="panel-section-heading">
                      <strong>Acknowledgements</strong>
                    </div>
                    <div className="about-credit-list plugin-sublist">
                      {state.app.thirdPartyCredits.map((credit) => (
                        <div className="about-credit-card" key={credit.name}>
                          <div className="about-credit-heading">
                            <strong>{credit.name}</strong>
                            <span>{credit.license}</span>
                          </div>
                          <span>{credit.description}</span>
                          <div className="about-credit-meta">
                            {credit.authors && (
                              <span>
                                <strong>Authors</strong>
                                {credit.authors}
                              </span>
                            )}
                            {credit.copyrightNotice && (
                              <span>
                                <strong>Copyright</strong>
                                {credit.copyrightNotice}
                              </span>
                            )}
                          </div>
                          <div className="about-credit-links">
                            {credit.repository && <code>{credit.repository}</code>}
                            {credit.paper && <code>{credit.paper}</code>}
                            {credit.licenseUrl && <code>{credit.licenseUrl}</code>}
                          </div>
                          {credit.notice && <span>{credit.notice}</span>}
                          {credit.licenseText && (
                            <details className="about-license-notice">
                              <summary>License notice</summary>
                              <pre>{credit.licenseText}</pre>
                            </details>
                          )}
                        </div>
                      ))}
                    </div>
                  </section>
                ) : (
                  <p className="panel-note">No third-party acknowledgements are bundled for this build.</p>
                )
          )}
        </SettingsSection>
  );
}
