import {
  AlertCircle,
  BookOpenText,
  Check,
  ClipboardPaste,
  Download,
  ExternalLink,
  KeyRound,
  LoaderCircle,
  RefreshCw,
  Shield,
  Trash2,
  X,
  Zap,
} from "lucide-react";
import { RefObject, useState } from "react";
import type { DesktopUpdateState, ProviderStatus } from "../../shared/desktopTypes";
import type {
  PermissionMode,
  PermissionPromptResponseMode,
  PermissionRequest,
  PrivilegedCredentialRequest,
  SecureInputRequest,
} from "../../shared/permissionTypes";
import {
  localDeepResearchInstallProgressModel,
  localDeepResearchSetupActions,
  localDeepResearchSetupResultModel,
  type LocalDeepResearchSetupAction,
} from "./localDeepResearchUiModel";
import {
  ApiKeyStatus,
  desktopUpdateStatusText,
  formatPanelFileSize,
  LocalDeepResearchDiagnosticsList,
  LocalDeepResearchSetupUiState,
  truncateUiText,
} from "./RightPanel";
import "./styles.css";

export { CommandPalette, type CommandPaletteItem } from "./AppCommandPalette";

export const apiKeyUrlLabel = "app.ambient.xyz/keys";

export type AmbientCliSecretDialogState = {
  packageId?: string;
  packageName: string;
  builderSourcePath?: string;
  mcpServerId?: string;
  mcpCandidateId?: string;
  mcpCandidateRef?: string;
  envName: string;
  value: string;
  status?: ApiKeyStatus;
  busy: boolean;
};

export function DesktopUpdateNotice({
  update,
  open,
  busy,
  onToggle,
  onCheck,
  onDownload,
  onInstall,
  onDismiss,
}: {
  update: DesktopUpdateState;
  open: boolean;
  busy: boolean;
  onToggle: () => void;
  onCheck: () => void;
  onDownload: () => void;
  onInstall: () => void;
  onDismiss: () => void;
}) {
  if (!shouldShowUpdateNotice(update)) return null;
  const title = update.availableVersion ? `Ambient ${update.availableVersion}` : "Ambient update";
  const progress = update.progress?.percent ?? 0;
  const pillLabel =
    update.status === "downloaded"
      ? "Restart"
      : update.status === "downloading"
        ? `${Math.round(progress)}%`
        : update.status === "installing"
          ? "Installing"
          : "Update";

  return (
    <div className="desktop-update-anchor">
      <button type="button" className="desktop-update-pill" onClick={onToggle} aria-expanded={open}>
        {update.status === "downloading" || update.status === "installing" ? (
          <LoaderCircle size={14} className="spin" />
        ) : (
          <Download size={14} />
        )}
        <span>{pillLabel}</span>
      </button>
      {open && (
        <section className="desktop-update-popover" role="dialog" aria-label="Ambient Desktop update">
          <header>
            <div>
              <strong>{title}</strong>
              <span>{desktopUpdateStatusText(update)}</span>
            </div>
            <button type="button" className="icon-button" onClick={onDismiss} title="Dismiss update notice">
              <X size={15} />
            </button>
          </header>
          {update.error && (
            <p className="desktop-update-error">
              <AlertCircle size={14} />
              <span>{update.error}</span>
            </p>
          )}
          {update.status === "downloading" && (
            <div className="desktop-update-progress" aria-label="Update download progress">
              <span style={{ width: `${Math.max(2, progress)}%` }} />
            </div>
          )}
          {update.progress && (
            <small>
              {formatPanelFileSize(update.progress.transferred)} of {formatPanelFileSize(update.progress.total)} ·{" "}
              {formatPanelFileSize(update.progress.bytesPerSecond)}/s
            </small>
          )}
          {update.releaseNotes && <p className="desktop-update-notes">{truncateUiText(update.releaseNotes, 260)}</p>}
          <div className="desktop-update-actions">
            <button type="button" className="panel-button mini" onClick={onCheck} disabled={!update.canCheck || busy}>
              <RefreshCw size={14} />
              Check
            </button>
            {update.canDownload && (
              <button type="button" className="panel-button mini primary" onClick={onDownload} disabled={busy}>
                <Download size={14} />
                Download
              </button>
            )}
            {update.canInstall && (
              <button type="button" className="panel-button mini primary" onClick={onInstall} disabled={busy}>
                <Check size={14} />
                Restart
              </button>
            )}
          </div>
        </section>
      )}
    </div>
  );
}

export function LocalDeepResearchFollowupDialog({
  setup,
  q8Override,
  onQ8OverrideChange,
  onSetup,
  onOpenSettings,
  onClose,
}: {
  setup: LocalDeepResearchSetupUiState;
  q8Override: boolean;
  onQ8OverrideChange: (value: boolean) => void;
  onSetup: (action: LocalDeepResearchSetupAction) => void;
  onOpenSettings: () => void;
  onClose: () => void;
}) {
  const model = setup.result ? localDeepResearchSetupResultModel(setup.result) : undefined;
  const actions = localDeepResearchSetupActions(setup.result);
  const primaryAction = actions.find((action) => action.primary) ?? actions[0];
  const diagnostics = setup.diagnostics ?? model?.diagnostics ?? [];
  const progress = setup.progress ? localDeepResearchInstallProgressModel(setup.progress) : undefined;
  const setupReady = setup.result?.setupStatus === "ready";
  const title = setupReady ? "Local Deep Research Is Ready" : "Add Local Deep Research";
  const description = setupReady
    ? "Local Deep Research is already installed and ready to use with LiteResearcher, the current web research provider order, and the shared llama.cpp runtime."
    : "Scrapling is ready for isolated page reads. Ambient can now add Local Deep Research using LiteResearcher, the current web research provider order, and the shared llama.cpp runtime.";
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        className="mcp-runtime-dialog tone-info"
        role="dialog"
        aria-modal="true"
        aria-labelledby="local-deep-research-followup-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="permission-dialog-header">
          <span className="dialog-icon">
            <BookOpenText size={20} />
          </span>
          <div>
            <h2 id="local-deep-research-followup-title">{title}</h2>
            <p>{description}</p>
          </div>
          <button type="button" className="dialog-close-button" onClick={onClose} aria-label="Close Local Deep Research setup">
            <X size={18} aria-hidden="true" />
          </button>
        </header>
        <div className="mcp-runtime-dialog-scroll">
          <div className="mcp-runtime-dialog-status">
            <strong>
              {setup.status === "running"
                ? "Checking Local Deep Research"
                : (model?.statusLabel ?? setup.message ?? "Local Deep Research setup")}
            </strong>
            <span>
              {setup.result
                ? `${setup.result.modelSelection.profile.displayName} · ${setup.result.modelSelection.contextTokens.toLocaleString()} context tokens`
                : "Run a setup check to select the model profile, runtime artifact, and provider route for this machine."}
            </span>
          </div>
          {setup.message && setup.status === "error" && <p className="panel-status error">{setup.message}</p>}
          {progress && (
            <p className={`panel-status ${progress.tone === "error" ? "error" : progress.tone === "success" ? "success" : "info"}`}>
              {progress.title}
              {progress.detail ? ` ${progress.detail}` : ""}
            </p>
          )}
          {model && (
            <div className="plugin-note-list">
              {model.detailLabels.slice(0, 10).map((label) => (
                <span key={label}>{label}</span>
              ))}
            </div>
          )}
          <label className="setting-toggle">
            <input
              type="checkbox"
              checked={q8Override}
              disabled={setup.status === "running"}
              onChange={(event) => onQ8OverrideChange(event.target.checked)}
            />
            <span>Request Q8 model when memory policy allows it</span>
          </label>
          <LocalDeepResearchDiagnosticsList diagnostics={diagnostics} />
        </div>
        <div className="permission-actions">
          <button type="button" className="secondary-button" onClick={onClose}>
            {setupReady ? "Close" : "Not now"}
          </button>
          <button type="button" className="secondary-button" onClick={onOpenSettings}>
            Open Search & Web settings
          </button>
          {actions
            .filter((action) => action !== primaryAction)
            .slice(0, 2)
            .map((action) => (
              <button
                type="button"
                className="secondary-button"
                key={action.action}
                disabled={setup.status === "running"}
                title={action.title}
                onClick={() => onSetup(action.action)}
              >
                {action.label}
              </button>
            ))}
          {primaryAction && (
            <button
              type="button"
              className="primary-button"
              disabled={setup.status === "running"}
              title={primaryAction.title}
              onClick={() => onSetup(primaryAction.action)}
            >
              {setup.status === "running" ? "Working" : primaryAction.label}
            </button>
          )}
        </div>
      </section>
    </div>
  );
}

export function PermissionDialog({
  request,
  permissionMode,
  onRequestFullAccess,
  onRespond,
}: {
  request: PermissionRequest;
  permissionMode: PermissionMode;
  onRequestFullAccess: () => void;
  onRespond: (response: PermissionPromptResponseMode) => void;
}) {
  const allowLabel = request.risk === "plugin-tool" ? "Trust and allow once" : "Allow once";
  const reusableScopes = request.reusableScopes ?? [];
  const fullAccessEnabled = permissionMode === "full-access";
  return (
    <div className="modal-backdrop">
      <section className="permission-dialog" role="dialog" aria-modal="true" aria-labelledby="permission-dialog-title">
        <header className="permission-dialog-header">
          <span className="dialog-icon">
            <Shield size={20} />
          </span>
          <div>
            <h2 id="permission-dialog-title">{request.title}</h2>
            <p>{request.message}</p>
          </div>
        </header>
        <div className="permission-detail">
          <span>{request.toolName}</span>
          {request.detail && <pre>{request.detail}</pre>}
        </div>
        <div className="permission-actions">
          <button type="button" className="secondary-button" onClick={() => onRespond("deny")}>
            Deny
          </button>
          <button type="button" className="primary-button" onClick={() => onRespond("allow_once")}>
            {allowLabel}
          </button>
          {reusableScopes.includes("thread") && (
            <button type="button" className="secondary-button" onClick={() => onRespond("always_thread")}>
              Always for this thread
            </button>
          )}
          {reusableScopes.includes("workflow_thread") && (
            <button type="button" className="secondary-button" onClick={() => onRespond("always_workflow")}>
              Always for this workflow
            </button>
          )}
          {reusableScopes.includes("project") && (
            <button type="button" className="secondary-button" onClick={() => onRespond("always_project")}>
              Always for this project
            </button>
          )}
          {reusableScopes.includes("workspace") && (
            <button type="button" className="secondary-button" onClick={() => onRespond("always_workspace")}>
              Always for this workspace
            </button>
          )}
        </div>
        <PermissionFullAccessNote enabled={fullAccessEnabled} onRequestFullAccess={onRequestFullAccess} />
      </section>
    </div>
  );
}

export function PermissionFullAccessNote({ enabled, onRequestFullAccess }: { enabled: boolean; onRequestFullAccess: () => void }) {
  return (
    <div className="permission-full-access-note">
      <button
        type="button"
        className="permission-full-access-note-button"
        disabled={enabled}
        onClick={onRequestFullAccess}
        title={enabled ? "Full Access is already enabled for this chat." : "Switch this chat to Full Access mode."}
      >
        <Zap size={14} aria-hidden="true" />
        <span>Full Access</span>
      </button>
      <p>
        {enabled
          ? "Full Access is on for this chat. Some sensitive actions may still ask for confirmation."
          : "Want fewer approval prompts? Click Full Access to reduce most future approvals for this chat."}
      </p>
    </div>
  );
}

export function PrivilegedCredentialDialog({
  request,
  onRespond,
}: {
  request: PrivilegedCredentialRequest;
  onRespond: (credential?: string) => void;
}) {
  const [credential, setCredential] = useState("");
  const trimmed = credential.trim();
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={() => onRespond(undefined)}>
      <section
        className="permission-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="privileged-credential-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="permission-dialog-header">
          <span className="dialog-icon danger">
            <Shield size={20} />
          </span>
          <div>
            <h2 id="privileged-credential-title">{request.title}</h2>
            <p>{request.message}</p>
          </div>
        </header>
        <div className="permission-detail">
          <span>{request.packageName ? `${request.packageName} · ${request.purpose}` : request.purpose}</span>
          <pre>{request.detail}</pre>
        </div>
        <label className="api-key-field">
          <span>{request.credentialLabel}</span>
          <input
            autoFocus
            type="password"
            value={credential}
            onChange={(event) => setCredential(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && trimmed) onRespond(trimmed);
              if (event.key === "Escape") onRespond(undefined);
            }}
          />
        </label>
        <div className="api-key-status info">
          The credential is used once in memory and is not visible to Pi, logs, descriptors, or artifacts.
        </div>
        <div className="permission-actions">
          <button type="button" className="secondary-button" onClick={() => onRespond(undefined)}>
            Cancel
          </button>
          <button type="button" className="primary-button" disabled={!trimmed} onClick={() => onRespond(trimmed)}>
            Continue
          </button>
        </div>
      </section>
    </div>
  );
}

export function SecureInputDialog({ request, onRespond }: { request: SecureInputRequest; onRespond: (value?: string) => void }) {
  const [value, setValue] = useState("");
  const trimmed = value.trim();
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={() => onRespond(undefined)}>
      <section
        className="permission-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="secure-input-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="permission-dialog-header">
          <span className="dialog-icon">
            <Shield size={20} />
          </span>
          <div>
            <h2 id="secure-input-title">{request.title}</h2>
            <p>{request.message}</p>
          </div>
        </header>
        <div className="permission-detail">
          <span>
            {request.providerId ? `${request.providerId}${request.profileId ? ` · ${request.profileId}` : ""}` : request.inputKind}
          </span>
          <pre>{request.detail}</pre>
        </div>
        <label className="api-key-field">
          <span>{request.inputLabel}</span>
          <input
            autoFocus
            type={request.inputMode === "password" ? "password" : "text"}
            inputMode={request.inputKind === "telegram_login_code" ? "numeric" : undefined}
            autoComplete="one-time-code"
            value={value}
            onChange={(event) => setValue(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && trimmed) onRespond(trimmed);
              if (event.key === "Escape") onRespond(undefined);
            }}
          />
        </label>
        <div className="api-key-status info">
          The value is used once in memory and is not visible to Pi, logs, descriptors, or artifacts.
        </div>
        <div className="permission-actions">
          <button type="button" className="secondary-button" onClick={() => onRespond(undefined)}>
            Cancel
          </button>
          <button type="button" className="primary-button" disabled={!trimmed} onClick={() => onRespond(trimmed)}>
            Continue
          </button>
        </div>
      </section>
    </div>
  );
}

export function ApiKeyDialog({
  provider,
  value,
  status,
  busy,
  clipboardCandidate,
  inputRef,
  onChange,
  onClose,
  onOpenKeys,
  onPaste,
  onSave,
  onUseClipboard,
  onTest,
  onClear,
}: {
  provider: ProviderStatus;
  value: string;
  status?: ApiKeyStatus;
  busy: boolean;
  clipboardCandidate: string;
  inputRef: RefObject<HTMLInputElement | null>;
  onChange: (value: string) => void;
  onClose: () => void;
  onOpenKeys: () => void;
  onPaste: () => void;
  onSave: () => void;
  onUseClipboard: () => void;
  onTest: () => void;
  onClear: () => void;
}) {
  const canUseClipboard = Boolean(clipboardCandidate && !value.trim());
  const providerLabel = provider.providerLabel ?? "Ambient";
  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <section
        className="api-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="api-dialog-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="api-dialog-header">
          <span className="dialog-icon">
            <KeyRound size={20} />
          </span>
          <div>
            <h2 id="api-dialog-title">Connect {providerLabel} API</h2>
            {provider.providerId === "ambient" ? (
              <p>
                Paste an API key from{" "}
                <button type="button" className="text-link" onClick={onOpenKeys}>
                  {apiKeyUrlLabel}
                  <ExternalLink size={13} />
                </button>
                .
              </p>
            ) : (
              <p>Paste a {providerLabel} API key for this debug provider override.</p>
            )}
          </div>
        </header>

        <label className="api-key-field">
          <span>{providerLabel} API key</span>
          <input
            ref={inputRef}
            type="password"
            value={value}
            onChange={(event) => onChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                onSave();
              }
              if (event.key === "Escape") {
                onClose();
              }
            }}
            placeholder="Paste key"
          />
        </label>

        {canUseClipboard && (
          <button type="button" className="clipboard-suggestion" onClick={onUseClipboard} disabled={busy}>
            <ClipboardPaste size={16} />
            Use key from clipboard
          </button>
        )}

        {status && <div className={`api-key-status ${status.kind}`}>{status.message}</div>}

        <div className="api-dialog-actions">
          <div className="api-dialog-left-actions">
            {provider.providerId === "ambient" && (
              <button type="button" className="secondary-button" onClick={onOpenKeys}>
                Get key
              </button>
            )}
            <button type="button" className="secondary-button" onClick={onPaste}>
              Paste
            </button>
            {provider.source === "saved" && (
              <button type="button" className="secondary-button danger" onClick={onClear} disabled={busy}>
                <Trash2 size={14} />
                Clear
              </button>
            )}
          </div>
          <div className="api-dialog-right-actions">
            <button type="button" className="secondary-button" onClick={onTest} disabled={busy}>
              Test key
            </button>
            <button type="button" className="secondary-button" onClick={onClose}>
              Close
            </button>
            <button
              type="button"
              className="primary-button"
              data-ui-required-action="api-key-save"
              onClick={canUseClipboard ? onUseClipboard : onSave}
              disabled={busy || (!value.trim() && !canUseClipboard)}
            >
              {canUseClipboard ? "Use clipboard" : "Save"}
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}

export function AmbientCliSecretDialog({
  dialog,
  inputRef,
  onChange,
  onPaste,
  onSave,
  onClose,
}: {
  dialog: AmbientCliSecretDialogState;
  inputRef: RefObject<HTMLInputElement | null>;
  onChange: (patch: Partial<AmbientCliSecretDialogState>) => void;
  onPaste: () => void;
  onSave: () => void;
  onClose: () => void;
}) {
  const isMcpSecret = Boolean(dialog.mcpServerId || dialog.mcpCandidateId || dialog.mcpCandidateRef);
  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <section
        className="api-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="ambient-cli-secret-dialog-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="api-dialog-header">
          <span className="dialog-icon">
            <KeyRound size={20} />
          </span>
          <div>
            <h2 id="ambient-cli-secret-dialog-title">{isMcpSecret ? "Add MCP Secret" : "Add CLI Secret"}</h2>
            <p>
              {isMcpSecret
                ? "Save a secret for an MCP server without sending it through chat."
                : dialog.builderSourcePath
                  ? "Save a secret for a generated capability draft without sending it through chat."
                  : "Save a secret for an installed Ambient CLI package without sending it through chat."}
            </p>
          </div>
        </header>

        <label className="api-key-field">
          <span>{isMcpSecret ? "MCP target" : "Package name"}</span>
          <input
            value={dialog.packageName}
            onChange={(event) => onChange({ packageName: event.target.value })}
            placeholder={isMcpSecret ? "MCP server" : "brave-search"}
            disabled={isMcpSecret || Boolean(dialog.packageId) || Boolean(dialog.builderSourcePath) || dialog.busy}
          />
        </label>

        {isMcpSecret && (
          <label className="api-key-field">
            <span>MCP id</span>
            <input value={dialog.mcpServerId ?? dialog.mcpCandidateId ?? dialog.mcpCandidateRef ?? ""} disabled />
          </label>
        )}

        {dialog.builderSourcePath && (
          <label className="api-key-field">
            <span>Builder source</span>
            <input value={dialog.builderSourcePath} disabled />
          </label>
        )}

        <label className="api-key-field">
          <span>Env name</span>
          <input
            value={dialog.envName}
            onChange={(event) => onChange({ envName: event.target.value })}
            placeholder="BRAVE_API_KEY"
            disabled={dialog.busy}
          />
        </label>

        <label className="api-key-field">
          <span>Secret value</span>
          <input
            ref={inputRef}
            type="password"
            value={dialog.value}
            onChange={(event) => onChange({ value: event.target.value })}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                onSave();
              }
              if (event.key === "Escape") {
                onClose();
              }
            }}
            placeholder="Paste secret"
            disabled={dialog.busy}
          />
        </label>

        {dialog.status && <div className={`api-key-status ${dialog.status.kind}`}>{dialog.status.message}</div>}

        <div className="api-dialog-actions">
          <div className="api-dialog-left-actions">
            <button type="button" className="secondary-button" onClick={onPaste} disabled={dialog.busy}>
              Paste
            </button>
          </div>
          <div className="api-dialog-right-actions">
            <button type="button" className="secondary-button" onClick={onClose}>
              Close
            </button>
            <button type="button" className="primary-button" onClick={onSave} disabled={dialog.busy || !dialog.value.trim()}>
              Save secret
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}

export function shouldShowUpdateNotice(update: DesktopUpdateState): boolean {
  if (!update.enabled) return false;
  if (update.status === "available" && update.dismissedVersion && update.dismissedVersion === update.availableVersion) return false;
  return ["available", "downloading", "downloaded", "installing", "error"].includes(update.status);
}
