import {
  AlertCircle,
  ClipboardPaste,
  ExternalLink,
  FileCode2,
  FileImage,
  FileText,
  Film,
  FolderOpen,
  LoaderCircle,
  Music,
  Trash2,
} from "lucide-react";
import type {
  BrowserCapabilityState,
  CodexMarketplaceSourceSummary,
  CodexPluginCompatibilityTier,
  CodexPluginSummary,
  DesktopState,
  FileTreeEntry,
  MiniCpmVisionDiagnosticItem,
  PermissionAuditEntry,
  PiExtensionSandboxPackageSummary,
  PiPackageResourceKind,
  PiPrivilegedInstallSummary,
  VoiceArtifactRetentionSummary,
  VoiceProviderCandidate,
  VoiceProviderVoiceCandidate,
  WorkspaceContextReference,
} from "../../shared/types";
import { miniCpmVisualMediaKindFromPath } from "./miniCpmVisualActionUiModel";
import { MiniCpmVisionDiagnosticsList } from "./RightPanelMiniCpmVisionDiagnostics";
import { formatPanelFileSize } from "./RightPanelFilePreview";
import { formatBytes, formatTimelineTime } from "./RightPanelSettingsRuntime";
import type { ApiKeyStatus } from "./RightPanelSettingsRuntime";

export type GitConfirmation = {
  title: string;
  message: string;
  details?: string[];
  confirmLabel: string;
  danger?: boolean;
  onConfirm: () => Promise<void> | void;
};


type VoiceSetupHealthItem = {
  label: string;
  detail: string;
  tone: "success" | "warning" | "error" | "info";
};

type VoiceProviderCacheHealth = {
  lastCompletedAt?: string;
  lastTrigger?: string;
  providerCount: number;
  error?: string;
};

export function contextAttachmentKey(item: WorkspaceContextReference): string {
  return `${item.absolute ? "absolute" : "workspace"}:${item.kind}:${item.path}`;
}


export function GitConfirmationDialog({
  confirmation,
  onCancel,
  onConfirm,
}: {
  confirmation: GitConfirmation;
  onCancel: () => void;
  onConfirm: () => Promise<void>;
}) {
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onCancel}>
      <div className="git-confirm-dialog" role="dialog" aria-modal="true" aria-labelledby="git-confirm-title" onMouseDown={(event) => event.stopPropagation()}>
        <div className="permission-dialog-header">
          <div className={`dialog-icon ${confirmation.danger ? "danger" : ""}`}>
            <AlertCircle size={20} />
          </div>
          <div>
            <h2 id="git-confirm-title">{confirmation.title}</h2>
            <p>{confirmation.message}</p>
          </div>
        </div>
        {confirmation.details && confirmation.details.length > 0 && (
          <div className="permission-detail">
            <span>Details</span>
            <pre>{confirmation.details.join("\n")}</pre>
          </div>
        )}
        <div className="permission-actions">
          <button type="button" className="secondary-button" onClick={onCancel}>
            Cancel
          </button>
          <button type="button" className={`secondary-button ${confirmation.danger ? "danger" : ""}`} onClick={() => void onConfirm()}>
            {confirmation.confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}



export function BrowserProfileCopyDialog({
  state,
  busy,
  onCancel,
  onConfirm,
}: {
  state?: BrowserCapabilityState;
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onCancel}>
      <div className="browser-copy-dialog" role="dialog" aria-modal="true" aria-labelledby="browser-copy-title" onMouseDown={(event) => event.stopPropagation()}>
        <div className="permission-dialog-header">
          <span className="dialog-icon">
            <ClipboardPaste size={20} />
          </span>
          <div>
            <h2 id="browser-copy-title">Copy Chrome profile?</h2>
            <p>
              Ambient will copy your Chrome profile into workspace browser state, excluding caches and browser locks. Cookies and login
              sessions may be included, the live Chrome profile will not be mutated, and the copy can be cleared later.
            </p>
          </div>
        </div>
        {state?.copiedProfileAvailable && (
          <p className="browser-profile-warning">
            A copied profile already exists. Copying again replaces the stored copy and records a new browser-profile audit entry.
          </p>
        )}
        <div className="permission-detail">
          <span>Source</span>
          <pre>{state?.sourceProfilePath || "No Chrome profile found"}</pre>
        </div>
        <div className="permission-detail">
          <span>Destination</span>
          <pre>{state?.copiedProfilePath || "Ambient browser state"}</pre>
        </div>
        <div className="permission-actions">
          <button type="button" className="secondary-button" onClick={onCancel} disabled={busy}>
            Cancel
          </button>
          <button type="button" className="secondary-button" onClick={onConfirm} disabled={busy || !state?.sourceProfilePath}>
            {busy ? "Copying" : state?.copiedProfileAvailable ? "Replace copied profile" : "Copy Chrome profile"}
          </button>
        </div>
      </div>
    </div>
  );
}



export function ContextPanel({
  attachments,
  busy,
  error,
  visualAnalysisBusy,
  visualAnalysisStatus,
  visualAnalysisDiagnostics,
  onPick,
  onRemove,
  onClear,
  onAnalyzeVisual,
}: {
  attachments: WorkspaceContextReference[];
  busy?: WorkspaceContextReference["kind"];
  error?: string;
  visualAnalysisBusy?: string;
  visualAnalysisStatus?: ApiKeyStatus;
  visualAnalysisDiagnostics?: MiniCpmVisionDiagnosticItem[];
  onPick: (kind: WorkspaceContextReference["kind"]) => void;
  onRemove: (item: WorkspaceContextReference) => void;
  onClear: () => void;
  onAnalyzeVisual?: (item: WorkspaceContextReference) => void;
}) {
  return (
    <div className="context-panel">
      <div className="context-actions">
        <button type="button" className="panel-button icon-panel-button" disabled={Boolean(busy)} onClick={() => onPick("file")}>
          <FileText size={14} />
          {busy === "file" ? "Choosing..." : "Choose files"}
        </button>
        <button type="button" className="panel-button icon-panel-button" disabled={Boolean(busy)} onClick={() => onPick("directory")}>
          <FolderOpen size={14} />
          {busy === "directory" ? "Choosing..." : "Choose folders"}
        </button>
      </div>
      {error && <p className="panel-status error">{error}</p>}
      {visualAnalysisStatus && <p className={`panel-status ${visualAnalysisStatus.kind}`}>{visualAnalysisStatus.message}</p>}
      <MiniCpmVisionDiagnosticsList diagnostics={visualAnalysisDiagnostics ?? []} compact />
      <div className="context-summary">
        <strong>Selected context</strong>
        <span>{attachments.length === 0 ? "None" : `${attachments.length} item${attachments.length === 1 ? "" : "s"}`}</span>
      </div>
      {attachments.length > 0 ? (
        <div className="context-list">
          {attachments.map((item) => {
            const visualKind = item.kind === "file" ? miniCpmVisualMediaKindFromPath(item.path) : undefined;
            const itemKey = contextAttachmentKey(item);
            return (
              <div className="context-row" key={itemKey}>
                <span>{item.kind === "directory" ? <FolderOpen size={14} /> : visualKind === "image" ? <FileImage size={14} /> : <FileText size={14} />}</span>
                <div>
                  <strong title={item.path}>{item.path}</strong>
                  <small>
                    {item.absolute ? "External " : ""}
                    {item.kind === "file" && item.size !== undefined ? formatPanelFileSize(item.size) : "Folder"}
                  </small>
                </div>
                {visualKind && onAnalyzeVisual && (
                  <button
                    type="button"
                    className="panel-button mini icon-panel-button"
                    disabled={Boolean(visualAnalysisBusy)}
                    title={`Analyze ${visualKind === "video" ? "sampled video frame" : "image"} with MiniCPM-V`}
                    onClick={() => onAnalyzeVisual(item)}
                  >
                    {visualAnalysisBusy === `context:${itemKey}` ? (
                      <LoaderCircle size={13} className="spin" />
                    ) : visualKind === "video" ? (
                      <Film size={13} />
                    ) : (
                      <FileImage size={13} />
                    )}
                    Analyze
                  </button>
                )}
                <button type="button" className="icon-button subtle" title="Remove context" onClick={() => onRemove(item)}>
                  <Trash2 size={14} />
                </button>
              </div>
            );
          })}
          <button type="button" className="panel-button" onClick={onClear}>
            Clear context
          </button>
        </div>
      ) : (
        <div className="panel-empty compact">
          <span>Selected paths will be attached to the next message as explicit context.</span>
        </div>
      )}
    </div>
  );
}



export function visibleFileEntries(entries: FileTreeEntry[], collapsedDirs: Set<string>): FileTreeEntry[] {
  return entries.filter((entry) => {
    for (const collapsed of collapsedDirs) {
      if (entry.path !== collapsed && entry.path.startsWith(`${collapsed}/`)) return false;
    }
    return true;
  });
}



export function fileIconForEntry(entry: FileTreeEntry) {
  if (entry.symlink) return <ExternalLink size={12} />;
  const extension = entry.name.toLowerCase().split(".").pop() ?? "";
  if (["png", "jpg", "jpeg", "gif", "webp", "svg", "avif"].includes(extension)) return <FileImage size={12} />;
  if (["aac", "flac", "m4a", "mp3", "oga", "ogg", "opus", "wav", "weba"].includes(extension)) return <Music size={12} />;
  if (["m4v", "mov", "mp4", "ogv", "webm"].includes(extension)) return <Film size={12} />;
  if (["md", "markdown", "txt"].includes(extension)) return <FileText size={12} />;
  if (["pdf", "doc", "docx", "ppt", "pptx", "xls", "xlsx"].includes(extension)) return <FileText size={12} />;
  return <FileCode2 size={12} />;
}



export function fileTreeEntryTitle(entry: FileTreeEntry): string {
  const details = [entry.path];
  if (entry.symlink) {
    details.push(`Symlink: ${entry.symlinkStatus ?? "unknown"}`);
    if (entry.symlinkTargetPath) details.push(`Target: ${entry.symlinkTargetPath}`);
    if (entry.blockedReason) details.push(entry.blockedReason);
  }
  return details.join("\n");
}



export function PiSandboxPackageDetailPanel({
  pkg,
  auditEntries,
}: {
  pkg: PiExtensionSandboxPackageSummary;
  auditEntries: PermissionAuditEntry[];
}) {
  return (
    <div className="plugin-detail-panel pi-package-detail-panel">
      <div className="plugin-sublist">
        <strong>Package Review</strong>
        <span>Source: {pkg.source}</span>
        <span>Resolved source: {pkg.resolvedSource}</span>
        <span>Entrypoint: {pkg.entrypoint}</span>
        <span>Fingerprint: {pkg.sha}</span>
        <span>Network policy: {pkg.allowedNetworkHosts.length ? pkg.allowedNetworkHosts.join(", ") : "No network"}</span>
      </div>
      <div className="plugin-sublist">
        <strong>Tool Surface</strong>
        {pkg.tools.length > 0 ? (
          pkg.tools.map((tool) => (
            <span key={tool.name}>{tool.name}{tool.description ? `: ${tool.description}` : ""}</span>
          ))
        ) : (
          <span>No registered tools.</span>
        )}
      </div>
      <PiPackageAuditTimeline entries={auditEntries} emptyLabel="No audit events found for this sandboxed package yet." />
    </div>
  );
}



export function PiPrivilegedPackageDetailPanel({
  pkg,
  auditEntries,
}: {
  pkg: PiPrivilegedInstallSummary;
  auditEntries: PermissionAuditEntry[];
}) {
  const risks = Object.entries(pkg.scan.riskSummary)
    .filter(([, detected]) => detected)
    .map(([risk]) => formatTaskState(risk));
  return (
    <div className="plugin-detail-panel pi-package-detail-panel">
      <div className="plugin-sublist">
        <strong>Package Review</strong>
        <span>Source: {pkg.source}</span>
        <span>Scan origin: {pkg.scan.scanOrigin === "sandbox-fallback" ? "Sandbox fallback" : "Explicit privileged scan"}</span>
        <span>Installed: {formatTimelineTime(pkg.installedAt)}</span>
        {"removedAt" in pkg && typeof pkg.removedAt === "string" && <span>Removed: {formatTimelineTime(pkg.removedAt)}</span>}
        {pkg.disabledAt && <span>Disabled: {formatTimelineTime(pkg.disabledAt)}</span>}
        <span>Fingerprint: {pkg.scan.fingerprint}</span>
        <span>Risk flags: {risks.length ? risks.join(", ") : "None"}</span>
      </div>
      <div className="plugin-sublist">
        <strong>Privileged Resources</strong>
        <span>Extensions: {pkg.scan.resources.piExtensions.length || 0}</span>
        <span>Skills: {pkg.scan.resources.piSkills.length || 0}</span>
        <span>Prompts: {pkg.scan.resources.piPrompts.length || 0}</span>
        <span>Themes: {pkg.scan.resources.piThemes.length || 0}</span>
        <span>Bins: {pkg.scan.resources.bins.length || 0}</span>
        <span>MCP servers: {pkg.scan.resources.mcpServers.length || 0}</span>
        <span>Hook configs: {pkg.scan.resources.hookConfigs.length || 0}</span>
      </div>
      {pkg.scan.findings.length > 0 && (
        <div className="plugin-sublist">
          <strong>Scan Findings</strong>
          {pkg.scan.findings.slice(0, 10).map((finding) => (
            <span key={`${finding.category}:${finding.message}`}>[{finding.severity}] {finding.category}: {finding.message}</span>
          ))}
        </div>
      )}
      {"manualCleanup" in pkg && Array.isArray(pkg.manualCleanup) && pkg.manualCleanup.length > 0 && (
        <div className="plugin-sublist">
          <strong>Cleanup Notes</strong>
          {pkg.manualCleanup.map((note) => (
            <span key={note}>{note}</span>
          ))}
        </div>
      )}
      <PiPackageAuditTimeline entries={auditEntries} emptyLabel="No audit events found for this privileged package yet." />
    </div>
  );
}



function PiPackageAuditTimeline({ entries, emptyLabel }: { entries: PermissionAuditEntry[]; emptyLabel: string }) {
  return (
    <div className="plugin-sublist pi-package-audit-timeline">
      <strong>Audit Timeline</strong>
      {entries.length > 0 ? (
        entries.slice(0, 8).map((entry) => (
          <div className={`permission-log-row ${entry.decision}`} key={entry.id}>
            <div>
              <strong>{entry.toolName}</strong>
              <span>{entry.decision === "allowed" ? "Allowed" : "Denied"}</span>
            </div>
            <small>
              {formatTimelineTime(entry.createdAt)} · {formatPermissionRisk(entry.risk)}
              {entry.decisionSource ? ` · ${formatPermissionDecisionSource(entry.decisionSource)}` : ""}
            </small>
            <code title={entry.detail ?? undefined}>{formatPermissionAuditDetail(entry)}</code>
          </div>
        ))
      ) : (
        <span>{emptyLabel}</span>
      )}
    </div>
  );
}



export function formatPermissionRisk(risk: PermissionAuditEntry["risk"]): string {
  if (risk === "outside-workspace") return "Outside workspace";
  if (risk === "network-command") return "Network command";
  if (risk === "plugin-tool") return "Plugin tool";
  if (risk === "privileged-action") return "Privileged action";
  if (risk === "browser-network") return "Browser network";
  if (risk === "browser-control") return "Browser control";
  if (risk === "browser-login") return "Browser login";
  if (risk === "browser-credential") return "Browser credential";
  if (risk === "browser-profile") return "Browser profile";
  if (risk === "permission-mode-change") return "Permission mode";
  if (risk === "secret-path") return "Sensitive path";
  if (risk === "workspace-command") return "Workspace command";
  return "Destructive command";
}



export function isSandboxFallbackPermissionAudit(entry: PermissionAuditEntry): boolean {
  return [entry.toolName, entry.reason, entry.detail].some((value) => value?.toLowerCase().includes("sandbox-fallback"));
}



export function piPackageAuditEntries(
  entries: PermissionAuditEntry[],
  packageRef: { packageName: string; packageId?: string; source?: string },
): PermissionAuditEntry[] {
  const needles = [packageRef.packageName, packageRef.packageId, packageRef.source].filter((value): value is string => Boolean(value));
  if (!needles.length) return [];
  return entries.filter((entry) => {
    const haystack = [entry.toolName, entry.reason, entry.detail].filter(Boolean).join("\n");
    return needles.some((needle) => haystack.includes(needle));
  });
}



export function formatPermissionAuditDetail(entry: PermissionAuditEntry): string {
  if (!entry.detail) return "";
  if (!isSandboxFallbackPermissionAudit(entry)) return compactPermissionDetail(entry.detail);
  const packageName = permissionDetailValue(entry.detail, "Package") ?? entry.toolName;
  const findings = permissionDetailValue(entry.detail, "Findings");
  const recommendation = permissionDetailValue(entry.detail, "Recommendation");
  return [
    "Sandbox fallback privileged review",
    packageName,
    recommendation ? `recommendation ${recommendation}` : undefined,
    findings ? `${findings} finding${findings === "1" ? "" : "s"}` : undefined,
  ].filter((part): part is string => Boolean(part)).join(" · ");
}



function compactPermissionDetail(detail: string): string {
  const meaningful = detail.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const compact = meaningful.slice(0, 4).join(" · ") || detail.trim();
  return compact.length > 220 ? `${compact.slice(0, 217)}...` : compact;
}



function permissionDetailValue(detail: string, label: string): string | undefined {
  const prefix = `${label}:`;
  const line = detail.split(/\r?\n/).find((item) => item.trim().startsWith(prefix));
  return line?.slice(line.indexOf(prefix) + prefix.length).trim();
}



function formatPermissionDecisionSource(source: NonNullable<PermissionAuditEntry["decisionSource"]>): string {
  if (source === "prompt_allow_once") return "Allow once";
  if (source === "prompt_always_thread") return "Always thread";
  if (source === "prompt_always_workflow") return "Always workflow";
  if (source === "prompt_always_project") return "Always project";
  if (source === "prompt_always_workspace") return "Always workspace";
  if (source === "persistent_grant") return "Persistent grant";
  if (source === "allowed_by_full_access") return "Full Access";
  if (source === "denied_by_policy") return "Denied by policy";
  if (source === "denied_by_user") return "Denied by user";
  return "Policy";
}



export function formatPluginCompatibility(tier: CodexPluginCompatibilityTier): string {
  if (tier === "supported") return "Supported";
  if (tier === "partial") return "Partial support";
  return "Unsupported";
}



export function formatCodexPluginSourceKind(plugin: Pick<CodexPluginSummary, "sourceKind" | "marketplaceKind">): string {
  if (plugin.sourceKind === "codex-cache") return "Local Codex cache";
  if (plugin.marketplaceKind === "ambient-curated") return "Ambient curated marketplace";
  if (plugin.sourceKind === "remote-marketplace") return "Remote marketplace";
  return "Workspace marketplace";
}



export function formatCodexMarketplaceSourceKind(kind: CodexMarketplaceSourceSummary["kind"]): string {
  if (kind === "ambient-curated") return "Ambient curated marketplace";
  if (kind === "hosted-codex") return "Hosted Codex marketplace";
  if (kind === "remote") return "Remote marketplace";
  return "Workspace marketplace";
}



export function formatCodexMarketplaceSignatureStatus(status: NonNullable<CodexMarketplaceSourceSummary["signatureStatus"]>): string {
  if (status === "verified") return "Signature verified";
  if (status === "unsigned-dev") return "Unsigned dev source";
  if (status === "missing") return "Signature missing";
  return "Signature invalid";
}



export function formatPiResourceCounts(counts: Record<PiPackageResourceKind, number>): string {
  const parts = [
    counts.extension > 0 ? `${counts.extension} extension${counts.extension === 1 ? "" : "s"}` : "",
    counts.skill > 0 ? `${counts.skill} skill${counts.skill === 1 ? "" : "s"}` : "",
    counts.prompt > 0 ? `${counts.prompt} prompt${counts.prompt === 1 ? "" : "s"}` : "",
    counts.theme > 0 ? `${counts.theme} theme${counts.theme === 1 ? "" : "s"}` : "",
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(", ") : "No declared resources";
}



export function formatPiDependencyStatus(status: { installed: boolean; packageNames: string[] }): string {
  return `${status.packageNames.length} dependenc${status.packageNames.length === 1 ? "y" : "ies"} ${status.installed ? "present" : "missing"}`;
}



export function voiceOptionLabel(voice: VoiceProviderVoiceCandidate): string {
  const details = [
    voice.source === "dynamic-cache" ? "cached" : voice.source === "declared" ? "declared" : undefined,
    voice.locale,
    voice.style?.slice(0, 2).join("/"),
  ].filter(Boolean);
  return `${voice.label ?? voice.id}${details.length ? ` - ${details.join(" · ")}` : ""}`;
}



export function preferredVoiceForProvider(provider: VoiceProviderCandidate, preferredVoiceId: string | undefined): VoiceProviderVoiceCandidate | undefined {
  if (preferredVoiceId) {
    const preferred = provider.voices.find((voice) => voice.id === preferredVoiceId);
    if (preferred || provider.voices.length === 0) return preferred ?? { id: preferredVoiceId };
  }
  return provider.voices[0];
}



export function voiceSetupHealthItems(input: {
  settings: DesktopState["settings"]["voice"];
  selectedProvider?: VoiceProviderCandidate;
  cacheStatus: VoiceProviderCacheHealth;
  cacheLoading: boolean;
  retention?: VoiceArtifactRetentionSummary;
  retentionLoading: boolean;
  retentionError?: string;
}): VoiceSetupHealthItem[] {
  let providerItem: VoiceSetupHealthItem;
  if (!input.settings.providerCapabilityId) {
    providerItem = { label: "Provider", detail: "No provider selected", tone: "info" };
  } else if (!input.selectedProvider) {
    providerItem = { label: "Provider", detail: "Selected provider is not in the current cache", tone: "warning" };
  } else if (input.selectedProvider.available) {
    providerItem = { label: "Provider", detail: `${input.selectedProvider.label} available`, tone: "success" };
  } else {
    providerItem = {
      label: "Provider",
      detail: `${input.selectedProvider.label} unavailable: ${input.selectedProvider.availabilityReason || "health check failed"}`,
      tone: "error",
    };
  }

  let cacheItem: VoiceSetupHealthItem;
  if (input.cacheLoading) {
    cacheItem = { label: "Cache", detail: "Refreshing provider cache", tone: "info" };
  } else if (input.cacheStatus.error) {
    cacheItem = { label: "Cache", detail: `Last refresh failed: ${input.cacheStatus.error}`, tone: "error" };
  } else if (input.cacheStatus.lastCompletedAt) {
    cacheItem = {
      label: "Cache",
      detail: `${input.cacheStatus.providerCount.toLocaleString()} providers refreshed ${formatTimelineTime(input.cacheStatus.lastCompletedAt)}${input.cacheStatus.lastTrigger ? ` via ${input.cacheStatus.lastTrigger}` : ""}`,
      tone: "success",
    };
  } else {
    cacheItem = { label: "Cache", detail: "Provider cache has not refreshed yet", tone: "warning" };
  }

  let artifactItem: VoiceSetupHealthItem;
  if (input.retentionError) {
    artifactItem = { label: "Artifacts", detail: `Inventory failed: ${input.retentionError}`, tone: "error" };
  } else if (input.retentionLoading) {
    artifactItem = { label: "Artifacts", detail: "Scanning active-thread voice artifacts", tone: "info" };
  } else if (input.retention) {
    artifactItem = {
      label: "Artifacts",
      detail: `${input.retention.managedFileCount.toLocaleString()} managed (${formatBytes(input.retention.managedBytes)}), ${input.retention.referencedFileCount.toLocaleString()} referenced, ${input.retention.orphanedFileCount.toLocaleString()} orphaned`,
      tone: input.retention.orphanedFileCount > 0 ? "warning" : "success",
    };
  } else {
    artifactItem = { label: "Artifacts", detail: "No active-thread artifact scan yet", tone: "warning" };
  }

  return [providerItem, cacheItem, artifactItem];
}



export function truncateUiText(value: string, maxLength: number): string {
  return value.length > maxLength ? `${value.slice(0, maxLength)}...` : value;
}



export function formatJsonPreview(value: unknown): string {
  try {
    const formatted = JSON.stringify(value, null, 2);
    return formatted.length > 800 ? `${formatted.slice(0, 800)}...` : formatted;
  } catch {
    return String(value);
  }
}



export function formatTaskState(state: string): string {
  return state
    .split(/[_-]/)
    .filter(Boolean)
    .map((part) => part[0].toUpperCase() + part.slice(1))
    .join(" ");
}
