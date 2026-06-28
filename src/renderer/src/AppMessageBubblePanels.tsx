import { AlertCircle, Check, ClipboardPaste, Copy, FileText, FolderOpen, Kanban, RefreshCw, RotateCcw } from "lucide-react";
import type { ReactNode } from "react";

import type { PlannerPlanArtifact } from "../../shared/plannerTypes";
import type { ChatMessage } from "../../shared/threadTypes";
import type { WorkspaceOpenTarget } from "../../shared/workspaceTypes";
import {
  clampNumber,
  isHtmlArtifactPath,
  LinkContextMenuPortal,
  OpenTargetIcon,
  RichText,
  type LinkContextMenuState,
} from "./RightPanel";
import type { ArtifactPathHints } from "./toolMessageUiModel";

export function MessageBubbleHeader({
  roleLabel,
  timestampLabel,
  createdAt,
  accessory,
}: {
  roleLabel: string;
  timestampLabel?: string;
  createdAt?: string;
  accessory?: ReactNode;
}) {
  return (
    <div className="message-header">
      <div className="message-role">{roleLabel}</div>
      {accessory}
      {timestampLabel && (
        <time className="message-timestamp" dateTime={createdAt}>
          {timestampLabel}
        </time>
      )}
    </div>
  );
}

export function MessageContentBody({
  diagnosticContent,
  thinking,
  streaming,
  streamingPlaceholder,
  highlightQuery,
  artifactPathHints,
  workspacePath,
  onPreviewPath,
  onPreviewLocalPath,
  onOpenMediaModal,
  onOpenUrl,
  onOpenBrowserUrl,
}: {
  diagnosticContent: string;
  thinking: boolean;
  streaming: boolean;
  streamingPlaceholder?: string;
  highlightQuery?: string;
  artifactPathHints: ArtifactPathHints;
  workspacePath: string;
  onPreviewPath: (path: string) => void;
  onPreviewLocalPath: (path: string) => void;
  onOpenMediaModal: (path: string, mediaKind: "image" | "video") => void;
  onOpenUrl: (url: string) => void;
  onOpenBrowserUrl: (url: string) => void;
}) {
  return (
    <div className="message-content">
      {diagnosticContent ? (
        <>
          <RichText
            content={diagnosticContent}
            compact={thinking}
            highlightQuery={highlightQuery}
            artifactPathHints={artifactPathHints}
            onPreviewPath={onPreviewPath}
            onPreviewLocalPath={onPreviewLocalPath}
            onOpenMediaModal={onOpenMediaModal}
            onOpenUrl={onOpenUrl}
            onOpenBrowserUrl={onOpenBrowserUrl}
            workspacePath={workspacePath}
          />
          {streaming && thinking && <span className="cursor thinking-cursor" />}
        </>
      ) : streamingPlaceholder ? (
        <span className="streaming-placeholder">
          <span>{streamingPlaceholder}</span>
          <span className="cursor" />
        </span>
      ) : null}
    </div>
  );
}

export function PlannerMessageWarningStrips({
  artifact,
}: {
  artifact?: PlannerPlanArtifact;
}) {
  return (
    <>
      {artifact?.warnings?.length ? (
        <div className="planner-plan-warnings" role="status" aria-label="Planner warnings">
          <AlertCircle size={14} />
          <div>
            <strong>Planner warning</strong>
            {artifact.warnings.map((warning, index) => (
              <span key={`${index}:${warning}`}>{warning}</span>
            ))}
          </div>
        </div>
      ) : null}
      {artifact?.durableArtifactValidation && !artifact.durableArtifactValidation.ok ? (
        <div className="planner-plan-warnings" role="status" aria-label="Durable plan validation errors">
          <AlertCircle size={14} />
          <div>
            <strong>Durable plan validation failed</strong>
            {artifact.durableArtifactValidation.errors.map((issue, index) => (
              <span key={`${issue.code}:${index}`}>{issue.section ? `${issue.section}: ${issue.message}` : issue.message}</span>
            ))}
          </div>
        </div>
      ) : null}
    </>
  );
}

export function MessageActionBar({
  message,
  plannerPlanArtifact,
  durablePlanPath,
  durablePlanMenu,
  durablePlanChromeOpenTarget,
  durablePlanPrimaryOpenTarget,
  durablePlanSecondaryOpenTargets,
  plannerPlanFinalizationRunning,
  plannerPlanReadyForActions,
  canGenerateDurablePlan,
  plannerDurableGenerating,
  canRefinePlannerPlan,
  canImplementPlannerPlan,
  canRetryMessage,
  canCopyMessage,
  copied,
  copyKind,
  hasProjectBoard,
  onPreviewPath,
  onOpenDurablePlanMenu,
  onCloseDurablePlanMenu,
  onOpenDurablePlanWith,
  onRevealDurablePlanFile,
  onGeneratePlannerDurableArtifact,
  onAddPlannerPlanToBoard,
  onRefinePlannerPlan,
  onImplementPlannerPlan,
  onRetry,
  onCopyMessageContent,
}: {
  message: ChatMessage;
  plannerPlanArtifact?: PlannerPlanArtifact;
  durablePlanPath?: string;
  durablePlanMenu?: LinkContextMenuState;
  durablePlanChromeOpenTarget?: WorkspaceOpenTarget;
  durablePlanPrimaryOpenTarget?: WorkspaceOpenTarget;
  durablePlanSecondaryOpenTargets: WorkspaceOpenTarget[];
  plannerPlanFinalizationRunning: boolean;
  plannerPlanReadyForActions: boolean;
  canGenerateDurablePlan: boolean;
  plannerDurableGenerating: boolean;
  canRefinePlannerPlan: boolean;
  canImplementPlannerPlan: boolean;
  canRetryMessage: boolean;
  canCopyMessage: boolean;
  copied: boolean;
  copyKind: "prompt" | "response";
  hasProjectBoard: boolean;
  onPreviewPath: (path: string) => void;
  onOpenDurablePlanMenu: (menu: LinkContextMenuState) => void;
  onCloseDurablePlanMenu: () => void;
  onOpenDurablePlanWith: (targetId?: string) => void;
  onRevealDurablePlanFile: () => void;
  onGeneratePlannerDurableArtifact: (artifact: PlannerPlanArtifact) => void | Promise<void>;
  onAddPlannerPlanToBoard: (artifact: PlannerPlanArtifact) => void | Promise<void>;
  onRefinePlannerPlan: (artifact: PlannerPlanArtifact) => void | Promise<void>;
  onImplementPlannerPlan: (artifact: PlannerPlanArtifact) => void | Promise<void>;
  onRetry?: (message: ChatMessage) => void | Promise<void>;
  onCopyMessageContent: () => void | Promise<void>;
}) {
  return (
    <div className="message-actions">
      {durablePlanPath ? (
        <button
          type="button"
          className="message-action-button text"
          title="Preview durable plan"
          aria-label="Preview durable plan"
          onClick={() => onPreviewPath(durablePlanPath)}
          onContextMenu={(event) => {
            event.preventDefault();
            event.stopPropagation();
            onOpenDurablePlanMenu({
              url: durablePlanPath,
              artifactPath: durablePlanPath,
              x: clampNumber(event.clientX, 8, Math.max(8, window.innerWidth - 236)),
              y: clampNumber(event.clientY, 8, Math.max(8, window.innerHeight - 320)),
            });
          }}
        >
          <FileText size={15} />
          Durable Plan
        </button>
      ) : plannerPlanArtifact && plannerPlanArtifact.status === "ready" ? (
        <button
          type="button"
          className="message-action-button text"
          title={canGenerateDurablePlan ? "Generate durable plan artifact" : "Answer required planner decisions first"}
          aria-label="Generate durable plan"
          disabled={!canGenerateDurablePlan}
          onClick={() => void onGeneratePlannerDurableArtifact(plannerPlanArtifact)}
        >
          <FileText size={15} />
          {plannerDurableGenerating ? "Generating" : "Durable Plan"}
        </button>
      ) : null}
      {plannerPlanArtifact && plannerPlanArtifact.status === "ready" && (
        <button
          type="button"
          className="message-action-button text"
          title={
            plannerPlanFinalizationRunning
              ? "Plan finalization is already running"
              : hasProjectBoard
                ? "Add this plan to the project board"
                : "Create a project board and add this plan"
          }
          aria-label="Add plan to board"
          disabled={!plannerPlanReadyForActions}
          onClick={() => void onAddPlannerPlanToBoard(plannerPlanArtifact)}
        >
          <Kanban size={15} />
          Add to Board
        </button>
      )}
      {plannerPlanArtifact && plannerPlanArtifact.status === "ready" && (
        <button
          type="button"
          className="message-action-button text"
          title={
            plannerPlanFinalizationRunning
              ? "Plan finalization is already running"
              : canRefinePlannerPlan
                ? "Revise this plan with feedback"
                : "Plan is not ready for revision"
          }
          aria-label="Revise with feedback"
          disabled={!canRefinePlannerPlan}
          onClick={() => void onRefinePlannerPlan(plannerPlanArtifact)}
        >
          <RefreshCw size={15} />
          Revise with feedback
        </button>
      )}
      {plannerPlanArtifact && plannerPlanArtifact.status === "ready" && (
        <button
          type="button"
          className="message-action-button text"
          title={
            plannerPlanFinalizationRunning
              ? "Plan finalization is already running"
              : canImplementPlannerPlan
                ? "Implement this plan"
                : "Answer required planner decisions first"
          }
          aria-label="Implement this plan"
          disabled={!canImplementPlannerPlan}
          onClick={() => void onImplementPlannerPlan(plannerPlanArtifact)}
        >
          <ClipboardPaste size={15} />
          Implement
        </button>
      )}
      {canRetryMessage && (
        <button
          type="button"
          className="message-action-button"
          title="Retry this prompt"
          aria-label="Retry this prompt"
          onClick={() => void onRetry?.(message)}
        >
          <RotateCcw size={15} />
        </button>
      )}
      {canCopyMessage && (
        <button
          type="button"
          className="message-action-button"
          title={copied ? `Copied ${copyKind}` : `Copy ${copyKind}`}
          aria-label={copied ? `Copied ${copyKind}` : `Copy ${copyKind}`}
          onClick={() => void onCopyMessageContent()}
        >
          {copied ? <Check size={15} /> : <Copy size={15} />}
        </button>
      )}
      {durablePlanMenu?.artifactPath && (
        <DurablePlanContextMenu
          menu={durablePlanMenu}
          chromeOpenTarget={durablePlanChromeOpenTarget}
          primaryOpenTarget={durablePlanPrimaryOpenTarget}
          secondaryOpenTargets={durablePlanSecondaryOpenTargets}
          onPreviewPath={onPreviewPath}
          onClose={onCloseDurablePlanMenu}
          onOpenWith={onOpenDurablePlanWith}
          onRevealFile={onRevealDurablePlanFile}
        />
      )}
    </div>
  );
}

function DurablePlanContextMenu({
  menu,
  chromeOpenTarget,
  primaryOpenTarget,
  secondaryOpenTargets,
  onPreviewPath,
  onClose,
  onOpenWith,
  onRevealFile,
}: {
  menu: LinkContextMenuState;
  chromeOpenTarget?: WorkspaceOpenTarget;
  primaryOpenTarget?: WorkspaceOpenTarget;
  secondaryOpenTargets: WorkspaceOpenTarget[];
  onPreviewPath: (path: string) => void;
  onClose: () => void;
  onOpenWith: (targetId?: string) => void;
  onRevealFile: () => void;
}) {
  if (!menu.artifactPath) return null;
  return (
    <LinkContextMenuPortal>
      <div
        className="link-context-menu"
        role="menu"
        aria-label="Durable plan options"
        style={{ left: menu.x, top: menu.y }}
        onClick={(event) => event.stopPropagation()}
        onMouseDown={(event) => event.stopPropagation()}
      >
      <button
        type="button"
        role="menuitem"
        onClick={() => {
          const path = menu.artifactPath!;
          onClose();
          onPreviewPath(path);
        }}
      >
        <FileText size={13} />
        <span>{isHtmlArtifactPath(menu.artifactPath) ? "Preview HTML in Ambient" : "Preview in Ambient"}</span>
      </button>
      {chromeOpenTarget && (
        <button
          type="button"
          role="menuitem"
          onClick={() => {
            onClose();
            onOpenWith(chromeOpenTarget.id);
          }}
        >
          <OpenTargetIcon target={chromeOpenTarget} />
          <span>Open in Google Chrome</span>
        </button>
      )}
      {primaryOpenTarget && (
        <button
          type="button"
          role="menuitem"
          onClick={() => {
            onClose();
            onOpenWith(primaryOpenTarget.id);
          }}
        >
          <OpenTargetIcon target={primaryOpenTarget} />
          <span>
            {primaryOpenTarget.kind === "default"
              ? "Open in default app"
              : `Open in ${primaryOpenTarget.label}`}
          </span>
        </button>
      )}
      {secondaryOpenTargets.map((target) => (
        <button
          type="button"
          role="menuitem"
          key={target.id}
          onClick={() => {
            onClose();
            onOpenWith(target.id);
          }}
        >
          <OpenTargetIcon target={target} />
          <span>Open with {target.label}</span>
        </button>
      ))}
      <div className="link-context-menu-divider" />
      <button
        type="button"
        role="menuitem"
        onClick={() => {
          onClose();
          onRevealFile();
        }}
      >
        <FolderOpen size={13} />
        <span>Reveal in Finder</span>
      </button>
      </div>
    </LinkContextMenuPortal>
  );
}
