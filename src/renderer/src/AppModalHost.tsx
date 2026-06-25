import { GitBranch, Shield } from "lucide-react";
import type { FormEvent, RefObject } from "react";
import type { DesktopState, ProviderStatus } from "../../shared/desktopTypes";
import type { LocalDeepResearchSetupAction } from "../../shared/localRuntimeTypes";
import type { PermissionMode, PermissionPromptResponseMode, PermissionRequest, PrivilegedCredentialRequest, SecureInputRequest } from "../../shared/permissionTypes";
import {
  AmbientCliSecretDialog,
  type AmbientCliSecretDialogState,
  ApiKeyDialog,
  CommandPalette,
  type CommandPaletteItem,
  LocalDeepResearchFollowupDialog,
  PermissionDialog,
  PrivilegedCredentialDialog,
  SecureInputDialog,
} from "./AppDialogs";
import {
  type PlannerRevisionDialogState,
  PlannerRevisionDialogView,
  type ProjectActionDialogState,
  ProjectActionDialogView,
  type ProjectBoardResetDialogState,
  ProjectBoardResetDialogView,
  type ThreadActionDialogState,
  ThreadActionDialogView,
} from "./AppActionDialogs";
import {
  MediaPreviewModal,
  type MediaPreviewModalRequest,
} from "./AppToolMessages";
import {
  type ApiKeyStatus,
  type GitConfirmation,
  GitConfirmationDialog,
  type LocalDeepResearchSetupUiState,
} from "./RightPanel";
import type {
  SubagentParentClusterApprovalActionModel,
  SubagentParentClusterMailboxActionModel,
} from "./subagentParentClusterUiModel";

export type SubagentBarrierDecisionDialogState = {
  action: SubagentParentClusterMailboxActionModel;
  userDecision: string;
  partialSummary: string;
  busy?: boolean;
  error?: string;
};

export type SubagentApprovalDecisionDialogState = {
  action: SubagentParentClusterApprovalActionModel;
  decision: "approved" | "denied";
  requestedScope: string;
  userDecision: string;
  busy?: boolean;
  error?: string;
};

type SubagentApprovalScopeOption = {
  value: string;
  label: string;
  description: string;
};

export function subagentApprovalInitialScope(action: SubagentParentClusterApprovalActionModel): string {
  if (action.decision === "denied") return "this_action";
  const normalized = normalizeSubagentApprovalScope(action.requestedScope) ?? normalizeSubagentApprovalScope(action.effectiveScope);
  if (!normalized || normalized === "this_action") return "this_action";
  if (normalized === "always") return "this_child_thread";
  return normalized;
}

export type AppModalHostProps = {
  mediaPreviewModal?: MediaPreviewModalRequest;
  generatedMediaAutoplay: DesktopState["settings"]["media"]["generatedMediaAutoplay"];
  provider: ProviderStatus;
  apiDialogOpen: boolean;
  apiKeyDraft: string;
  apiKeyStatus?: ApiKeyStatus;
  apiKeyBusy: boolean;
  clipboardCandidate: string;
  apiKeyInputRef: RefObject<HTMLInputElement | null>;
  ambientCliSecretDialog?: AmbientCliSecretDialogState;
  ambientCliSecretInputRef: RefObject<HTMLInputElement | null>;
  localDeepResearchFollowupOpen: boolean;
  localDeepResearchSetup: LocalDeepResearchSetupUiState;
  localDeepResearchQ8Override: boolean;
  subagentUiEnabled: boolean;
  subagentBarrierDecisionDialog?: SubagentBarrierDecisionDialogState;
  subagentApprovalDecisionDialog?: SubagentApprovalDecisionDialogState;
  commandPaletteOpen: boolean;
  commandPaletteQuery: string;
  commandItems: () => CommandPaletteItem[];
  projectActionDialog?: ProjectActionDialogState;
  projectBoardResetDialog?: ProjectBoardResetDialogState;
  plannerRevisionDialog?: PlannerRevisionDialogState;
  threadActionDialog?: ThreadActionDialogState;
  activePermissionRequest?: PermissionRequest;
  permissionMode: PermissionMode;
  activePrivilegedCredentialRequest?: PrivilegedCredentialRequest;
  activeSecureInputRequest?: SecureInputRequest;
  gitConfirmation?: GitConfirmation;
  onCloseMediaPreview: () => void;
  onOpenMediaPreviewInFiles: (path: string) => void;
  onApiKeyChange: (value: string) => void;
  onCloseApiKey: () => void;
  onOpenAmbientKeys: () => void;
  onPasteApiKey: () => void;
  onSaveApiKey: () => void;
  onUseClipboardApiKey: () => void;
  onTestApiKey: () => void;
  onClearSavedApiKey: () => void;
  onAmbientCliSecretChange: (patch: Partial<AmbientCliSecretDialogState>) => void;
  onPasteAmbientCliSecret: () => void;
  onSaveAmbientCliSecret: () => void;
  onCloseAmbientCliSecret: () => void;
  onLocalDeepResearchQ8OverrideChange: (value: boolean) => void;
  onSetupLocalDeepResearch: (action: LocalDeepResearchSetupAction) => void;
  onOpenSearchWebSettings: () => void;
  onCloseLocalDeepResearchFollowup: () => void;
  onChangeSubagentBarrierDecision: (
    patch: Partial<Pick<SubagentBarrierDecisionDialogState, "userDecision" | "partialSummary">>,
  ) => void;
  onCancelSubagentBarrierDecision: () => void;
  onConfirmSubagentBarrierDecision: () => void;
  onChangeSubagentApprovalDecision: (
    patch: Partial<Pick<SubagentApprovalDecisionDialogState, "requestedScope" | "userDecision">>,
  ) => void;
  onCancelSubagentApprovalDecision: () => void;
  onConfirmSubagentApprovalDecision: () => void;
  onCommandPaletteQueryChange: (query: string) => void;
  onRunPaletteCommand: (command: CommandPaletteItem) => void;
  onCloseCommandPalette: () => void;
  onChangeProjectActionName: (name: string) => void;
  onCancelProjectAction: () => void;
  onConfirmProjectAction: () => void;
  onCancelProjectBoardReset: () => void;
  onConfirmProjectBoardReset: () => void;
  onPlannerRevisionFeedbackChange: () => void;
  onCancelPlannerRevision: () => void;
  onConfirmPlannerRevision: (feedback: string) => void;
  onChangeThreadActionName: (name: string) => void;
  onCancelThreadAction: () => void;
  onConfirmThreadAction: () => void;
  onRequestFullAccess: () => void;
  onRespondPermissionRequest: (request: PermissionRequest, response: PermissionPromptResponseMode) => void;
  onRespondPrivilegedCredentialRequest: (request: PrivilegedCredentialRequest, credential?: string) => void;
  onRespondSecureInputRequest: (request: SecureInputRequest, value?: string) => void;
  onCancelGitConfirmation: () => void;
  onConfirmGitConfirmation: (confirmation: GitConfirmation) => Promise<void>;
};

export function AppModalHost({
  mediaPreviewModal,
  generatedMediaAutoplay,
  provider,
  apiDialogOpen,
  apiKeyDraft,
  apiKeyStatus,
  apiKeyBusy,
  clipboardCandidate,
  apiKeyInputRef,
  ambientCliSecretDialog,
  ambientCliSecretInputRef,
  localDeepResearchFollowupOpen,
  localDeepResearchSetup,
  localDeepResearchQ8Override,
  subagentUiEnabled,
  subagentBarrierDecisionDialog,
  subagentApprovalDecisionDialog,
  commandPaletteOpen,
  commandPaletteQuery,
  commandItems,
  projectActionDialog,
  projectBoardResetDialog,
  plannerRevisionDialog,
  threadActionDialog,
  activePermissionRequest,
  permissionMode,
  activePrivilegedCredentialRequest,
  activeSecureInputRequest,
  gitConfirmation,
  onCloseMediaPreview,
  onOpenMediaPreviewInFiles,
  onApiKeyChange,
  onCloseApiKey,
  onOpenAmbientKeys,
  onPasteApiKey,
  onSaveApiKey,
  onUseClipboardApiKey,
  onTestApiKey,
  onClearSavedApiKey,
  onAmbientCliSecretChange,
  onPasteAmbientCliSecret,
  onSaveAmbientCliSecret,
  onCloseAmbientCliSecret,
  onLocalDeepResearchQ8OverrideChange,
  onSetupLocalDeepResearch,
  onOpenSearchWebSettings,
  onCloseLocalDeepResearchFollowup,
  onChangeSubagentBarrierDecision,
  onCancelSubagentBarrierDecision,
  onConfirmSubagentBarrierDecision,
  onChangeSubagentApprovalDecision,
  onCancelSubagentApprovalDecision,
  onConfirmSubagentApprovalDecision,
  onCommandPaletteQueryChange,
  onRunPaletteCommand,
  onCloseCommandPalette,
  onChangeProjectActionName,
  onCancelProjectAction,
  onConfirmProjectAction,
  onCancelProjectBoardReset,
  onConfirmProjectBoardReset,
  onPlannerRevisionFeedbackChange,
  onCancelPlannerRevision,
  onConfirmPlannerRevision,
  onChangeThreadActionName,
  onCancelThreadAction,
  onConfirmThreadAction,
  onRequestFullAccess,
  onRespondPermissionRequest,
  onRespondPrivilegedCredentialRequest,
  onRespondSecureInputRequest,
  onCancelGitConfirmation,
  onConfirmGitConfirmation,
}: AppModalHostProps) {
  const securityPromptOpen = Boolean(activePermissionRequest || activePrivilegedCredentialRequest || activeSecureInputRequest);
  const showLocalDeepResearchFollowup = localDeepResearchFollowupOpen && !securityPromptOpen;
  return (
    <>
      {mediaPreviewModal && (
        <MediaPreviewModal
          request={mediaPreviewModal}
          generatedMediaAutoplay={generatedMediaAutoplay}
          onClose={onCloseMediaPreview}
          onOpenInFiles={onOpenMediaPreviewInFiles}
        />
      )}

      {apiDialogOpen && (
        <ApiKeyDialog
          provider={provider}
          value={apiKeyDraft}
          status={apiKeyStatus}
          busy={apiKeyBusy}
          clipboardCandidate={clipboardCandidate}
          inputRef={apiKeyInputRef}
          onChange={onApiKeyChange}
          onClose={onCloseApiKey}
          onOpenKeys={onOpenAmbientKeys}
          onPaste={onPasteApiKey}
          onSave={onSaveApiKey}
          onUseClipboard={onUseClipboardApiKey}
          onTest={onTestApiKey}
          onClear={onClearSavedApiKey}
        />
      )}

      {ambientCliSecretDialog && (
        <AmbientCliSecretDialog
          dialog={ambientCliSecretDialog}
          inputRef={ambientCliSecretInputRef}
          onChange={onAmbientCliSecretChange}
          onPaste={onPasteAmbientCliSecret}
          onSave={onSaveAmbientCliSecret}
          onClose={onCloseAmbientCliSecret}
        />
      )}

      {showLocalDeepResearchFollowup && (
        <LocalDeepResearchFollowupDialog
          setup={localDeepResearchSetup}
          q8Override={localDeepResearchQ8Override}
          onQ8OverrideChange={onLocalDeepResearchQ8OverrideChange}
          onSetup={onSetupLocalDeepResearch}
          onOpenSettings={onOpenSearchWebSettings}
          onClose={onCloseLocalDeepResearchFollowup}
        />
      )}

      {subagentUiEnabled && subagentBarrierDecisionDialog && (
        <SubagentBarrierDecisionDialog
          dialog={subagentBarrierDecisionDialog}
          onChange={onChangeSubagentBarrierDecision}
          onCancel={onCancelSubagentBarrierDecision}
          onConfirm={onConfirmSubagentBarrierDecision}
        />
      )}

      {subagentUiEnabled && subagentApprovalDecisionDialog && (
        <SubagentApprovalDecisionDialog
          dialog={subagentApprovalDecisionDialog}
          onChange={onChangeSubagentApprovalDecision}
          onCancel={onCancelSubagentApprovalDecision}
          onConfirm={onConfirmSubagentApprovalDecision}
        />
      )}

      {commandPaletteOpen && (
        <CommandPalette
          query={commandPaletteQuery}
          commands={commandItems()}
          onQueryChange={onCommandPaletteQueryChange}
          onRun={onRunPaletteCommand}
          onClose={onCloseCommandPalette}
        />
      )}

      {projectActionDialog && (
        <ProjectActionDialogView
          dialog={projectActionDialog}
          onChangeName={onChangeProjectActionName}
          onCancel={onCancelProjectAction}
          onConfirm={onConfirmProjectAction}
        />
      )}

      {projectBoardResetDialog && (
        <ProjectBoardResetDialogView
          dialog={projectBoardResetDialog}
          onCancel={onCancelProjectBoardReset}
          onConfirm={onConfirmProjectBoardReset}
        />
      )}

      {plannerRevisionDialog && (
        <PlannerRevisionDialogView
          key={plannerRevisionDialog.artifact.id}
          dialog={plannerRevisionDialog}
          onChangeFeedback={onPlannerRevisionFeedbackChange}
          onCancel={onCancelPlannerRevision}
          onConfirm={onConfirmPlannerRevision}
        />
      )}

      {threadActionDialog && (
        <ThreadActionDialogView
          dialog={threadActionDialog}
          onChangeName={onChangeThreadActionName}
          onCancel={onCancelThreadAction}
          onConfirm={onConfirmThreadAction}
        />
      )}

      {activePermissionRequest && (
        <PermissionDialog
          request={activePermissionRequest}
          permissionMode={permissionMode}
          onRequestFullAccess={onRequestFullAccess}
          onRespond={(response) => onRespondPermissionRequest(activePermissionRequest, response)}
        />
      )}

      {activePrivilegedCredentialRequest && (
        <PrivilegedCredentialDialog
          request={activePrivilegedCredentialRequest}
          onRespond={(credential) => onRespondPrivilegedCredentialRequest(activePrivilegedCredentialRequest, credential)}
        />
      )}

      {activeSecureInputRequest && (
        <SecureInputDialog
          request={activeSecureInputRequest}
          onRespond={(value) => onRespondSecureInputRequest(activeSecureInputRequest, value)}
        />
      )}

      {gitConfirmation && (
        <GitConfirmationDialog
          confirmation={gitConfirmation}
          onCancel={onCancelGitConfirmation}
          onConfirm={() => onConfirmGitConfirmation(gitConfirmation)}
        />
      )}
    </>
  );
}

export function subagentApprovalScopeOptions(): SubagentApprovalScopeOption[] {
  return [
    {
      value: "this_child_thread",
      label: "For this child",
      description: "Recommended. Apply to future matching actions in this child thread only.",
    },
    {
      value: "this_action",
      label: "This action only",
      description: "Approve only this single request.",
    },
    {
      value: "parent_thread_tree",
      label: "Parent thread tree",
      description: "Escalates beyond this child to the parent and sibling child sub-threads.",
    },
    {
      value: "project",
      label: "Project/workspace",
      description: "Escalates beyond this child to matching actions across this project workspace.",
    },
    {
      value: "global",
      label: "Global",
      description: "Escalates beyond this child to future matching actions everywhere.",
    },
  ];
}

function normalizeSubagentApprovalScope(value: string | undefined): string | undefined {
  const normalized = value?.trim().toLowerCase().replace(/[\s-]+/g, "_");
  if (!normalized) return undefined;
  switch (normalized) {
    case "always":
      return "always";
    case "this_action":
    case "action":
    case "once":
      return "this_action";
    case "this_child_thread":
    case "child_thread":
    case "thread":
    case "for_thread":
      return "this_child_thread";
    case "parent_thread_tree":
    case "parent_tree":
    case "thread_tree":
      return "parent_thread_tree";
    case "project":
    case "workspace":
    case "for_project":
      return "project";
    case "global":
      return "global";
    default:
      return undefined;
  }
}

function SubagentApprovalDecisionDialog({
  dialog,
  onChange,
  onCancel,
  onConfirm,
}: {
  dialog: SubagentApprovalDecisionDialogState;
  onChange: (patch: Partial<Pick<SubagentApprovalDecisionDialogState, "requestedScope" | "userDecision">>) => void;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const approving = dialog.decision === "approved";
  const scopeOptions = subagentApprovalScopeOptions();
  const selectedScope = scopeOptions.some((option) => option.value === dialog.requestedScope)
    ? dialog.requestedScope
    : scopeOptions[0]?.value ?? "this_action";
  const canConfirm = !dialog.busy;
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (canConfirm) onConfirm();
  }
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={() => !dialog.busy && onCancel()}>
      <form
        className="subagent-approval-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="subagent-approval-dialog-title"
        onSubmit={submit}
        onMouseDown={(event) => event.stopPropagation()}
        onKeyDown={(event) => {
          if (event.key === "Escape" && !dialog.busy) {
            event.preventDefault();
            onCancel();
          }
        }}
      >
        <header className="permission-dialog-header">
          <span className={`dialog-icon${approving ? "" : " danger"}`}>
            <Shield size={20} aria-hidden="true" />
          </span>
          <div>
            <h2 id="subagent-approval-dialog-title">{approving ? "Approve child request" : "Deny child request"}</h2>
            <p>{dialog.action.toolLabel ?? dialog.action.approvalId}</p>
          </div>
        </header>
        <div className="subagent-barrier-dialog-grid">
          <div className="permission-detail">
            <span>Approval</span>
            <pre>{dialog.action.approvalId}</pre>
          </div>
          <div className="permission-detail">
            <span>Child run</span>
            <pre>{dialog.action.childRunId}</pre>
          </div>
          {dialog.action.childThreadId && (
            <div className="permission-detail">
              <span>Child thread</span>
              <pre>{dialog.action.childThreadId}</pre>
            </div>
          )}
        </div>
        {dialog.action.sourceLabel && (
          <div className="permission-detail">
            <span>Blocking child</span>
            <pre>{dialog.action.sourceLabel}</pre>
          </div>
        )}
        {dialog.action.prompt && (
          <div className="permission-detail">
            <span>Request</span>
            <pre>{dialog.action.prompt}</pre>
          </div>
        )}
        <div className="permission-detail">
          <span>Parent wait state</span>
          <pre>Approval is sent to this child. The parent stays blocked until the child reaches a synthesis-safe result.</pre>
        </div>
        {approving && (
          <fieldset className="subagent-approval-scope-list">
            <legend>Approval scope</legend>
            {scopeOptions.map((option) => (
              <label key={option.value} className="subagent-approval-scope-option">
                <input
                  type="radio"
                  name="subagent-approval-scope"
                  value={option.value}
                  checked={selectedScope === option.value}
                  disabled={dialog.busy}
                  onChange={() => onChange({ requestedScope: option.value })}
                />
                <span>
                  <strong>{option.label}</strong>
                  <small>{option.description}</small>
                </span>
              </label>
            ))}
          </fieldset>
        )}
        <label className="subagent-barrier-dialog-field">
          <span>Decision note</span>
          <textarea
            autoFocus
            className="panel-textarea"
            value={dialog.userDecision}
            disabled={dialog.busy}
            placeholder="Optional note for the audit trail."
            onChange={(event) => onChange({ userDecision: event.target.value })}
          />
        </label>
        {dialog.error && (
          <div className="permission-detail danger">
            <span>Approval failed</span>
            <pre>{dialog.error}</pre>
          </div>
        )}
        <div className="permission-actions">
          <button type="button" className="secondary-button" onClick={onCancel} disabled={dialog.busy}>
            Cancel
          </button>
          <button type="submit" className="primary-button" disabled={!canConfirm}>
            {dialog.busy ? "Sending..." : approving ? "Approve child request" : "Deny child request"}
          </button>
        </div>
      </form>
    </div>
  );
}

function SubagentBarrierDecisionDialog({
  dialog,
  onChange,
  onCancel,
  onConfirm,
}: {
  dialog: SubagentBarrierDecisionDialogState;
  onChange: (patch: Partial<Pick<SubagentBarrierDecisionDialogState, "userDecision" | "partialSummary">>) => void;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const canConfirm = !dialog.busy &&
    (!dialog.action.requiresUserDecision || Boolean(dialog.userDecision.trim())) &&
    (!dialog.action.requiresPartialSummary || Boolean(dialog.partialSummary.trim()));
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (canConfirm) onConfirm();
  }
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={() => !dialog.busy && onCancel()}>
      <form
        className="subagent-barrier-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="subagent-barrier-dialog-title"
        onSubmit={submit}
        onMouseDown={(event) => event.stopPropagation()}
        onKeyDown={(event) => {
          if (event.key === "Escape" && !dialog.busy) {
            event.preventDefault();
            onCancel();
          }
        }}
      >
        <header className="permission-dialog-header">
          <span className="dialog-icon">
            <GitBranch size={20} aria-hidden="true" />
          </span>
          <div>
            <h2 id="subagent-barrier-dialog-title">Resolve sub-agent barrier</h2>
            <p>{dialog.action.label}</p>
          </div>
        </header>
        <div className="subagent-barrier-dialog-grid">
          <div className="permission-detail">
            <span>Wait barrier</span>
            <pre>{dialog.action.waitBarrierId}</pre>
          </div>
          <div className="permission-detail">
            <span>Decision</span>
            <pre>{dialog.action.decision}</pre>
          </div>
        </div>
        {dialog.action.sourceLabel && (
          <div className="permission-detail">
            <span>Blocking child</span>
            <pre>{dialog.action.sourceLabel}</pre>
          </div>
        )}
        {dialog.action.requiresUserDecision && (
          <label className="subagent-barrier-dialog-field">
            <span>Decision note</span>
            <textarea
              autoFocus
              className="panel-textarea"
              value={dialog.userDecision}
              disabled={dialog.busy}
              placeholder="Record the reason for this parent decision."
              onChange={(event) => onChange({ userDecision: event.target.value })}
            />
          </label>
        )}
        {dialog.action.requiresPartialSummary && (
          <label className="subagent-barrier-dialog-field">
            <span>Partial summary</span>
            <textarea
              autoFocus={!dialog.action.requiresUserDecision}
              className="panel-textarea"
              value={dialog.partialSummary}
              disabled={dialog.busy}
              placeholder="Summarize what the parent may use without the missing child result."
              onChange={(event) => onChange({ partialSummary: event.target.value })}
            />
          </label>
        )}
        {dialog.error && (
          <div className="permission-detail danger">
            <span>Barrier resolution failed</span>
            <pre>{dialog.error}</pre>
          </div>
        )}
        <div className="permission-actions">
          <button type="button" className="secondary-button" onClick={onCancel} disabled={dialog.busy}>
            Cancel
          </button>
          <button
            type="submit"
            className="primary-button"
            autoFocus={!dialog.action.requiresUserDecision && !dialog.action.requiresPartialSummary}
            disabled={!canConfirm}
          >
            {dialog.busy ? "Resolving..." : "Resolve barrier"}
          </button>
        </div>
      </form>
    </div>
  );
}
