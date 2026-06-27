import { Monitor, Package } from "lucide-react";
import { useMemo } from "react";

import type { ChatMessage } from "../../shared/threadTypes";
import {
  ToolMessagingConversationDirectorySetupCard,
  ToolMessagingRemoteSurfaceActivationCard,
  ToolSttPreview,
  ToolTelegramSessionSetupCard,
  ToolVoicePreview,
} from "./AppToolMessageCapabilityCards";
import {
  ToolEditPreview,
  ToolInstallRoutePreview,
  ToolLargeOutputPreviewView,
  ToolLongformInputPreviewView,
  ToolProgressPreviewView,
  ToolSection,
  ToolStatusIcon,
  isBrowserToolName,
  shouldRenderToolResultSection,
} from "./AppToolMessageDetailViews";
import { ArtifactPreviewStrip, ToolManagedFileArtifactsPreview, fileBaseName } from "./AppToolMessageMediaPreview";
import { parseToolMessage } from "./toolMessageUiModel";
import { workflowRecorderInjectedPlaybookChip } from "./workflowRecorderUiModel";

export {
  ToolMessagingConversationDirectorySetupCard,
  ToolMessagingRemoteSurfaceActivationCard,
  ToolSttPreview,
  ToolTelegramSessionSetupCard,
  ToolVoicePreview,
  telegramSessionSetupStatusLabel,
  telegramSessionSetupTone,
} from "./AppToolMessageCapabilityCards";
export { MediaPreviewModal, fileBaseName } from "./AppToolMessageMediaPreview";
export type { MediaPreviewModalRequest } from "./AppToolMessageMediaPreview";
export {
  ToolEditPreview,
  ToolInstallRoutePreview,
  ToolLargeOutputPreviewView,
  ToolLongformInputPreviewView,
  ToolProgressPreviewView,
  ToolSection,
  ToolStatusIcon,
  editTextCountLabel,
  isBrowserToolName,
  shouldRenderToolResultSection,
} from "./AppToolMessageDetailViews";

function messageStatus(message: ChatMessage): string | undefined {
  return typeof message.metadata?.status === "string" ? message.metadata.status : undefined;
}

export function ToolMessageCard({
  message,
  workspacePath,
  onPreviewPath,
  onPreviewLocalPath,
  onOpenUrl,
  onOpenBrowserUrl,
  onOpenBrowserPanel,
  onOpenMediaModal,
  generatedMediaAutoplay,
  toolActionDisabled,
  onSendTelegramSessionSetupPrompt,
  onSendRemoteSurfaceActivationPrompt,
}: {
  message: ChatMessage;
  workspacePath: string;
  onPreviewPath: (path: string) => void;
  onPreviewLocalPath: (path: string) => void;
  onOpenUrl: (url: string) => void;
  onOpenBrowserUrl: (url: string) => void;
  onOpenBrowserPanel: () => void;
  onOpenMediaModal: (path: string, mediaKind: "image" | "video") => void;
  generatedMediaAutoplay: boolean;
  toolActionDisabled?: boolean;
  onSendTelegramSessionSetupPrompt?: (prompt: string) => void | Promise<void>;
  onSendRemoteSurfaceActivationPrompt?: (prompt: string) => void | Promise<void>;
}) {
  const status = messageStatus(message);
  const toolName = typeof message.metadata?.toolName === "string" ? message.metadata.toolName : "Tool";
  const parsed = useMemo(
    () => parseToolMessage(message.content, toolName, workspacePath, message.metadata),
    [message.content, message.metadata, toolName, workspacePath],
  );
  const injectedPlaybookChip = workflowRecorderInjectedPlaybookChip(message.metadata);
  const canPreviewArtifact = parsed.artifactPath && status !== "running";
  const browserTool = isBrowserToolName(toolName);
  const hasStructuredBodyPreview = Boolean(
    parsed.installRoutePreview ||
    parsed.longformInputPreview ||
    parsed.editPreview ||
    parsed.voicePreview ||
    parsed.sttPreview ||
    parsed.telegramSessionSetup ||
    parsed.messagingConversationDirectorySetup ||
    parsed.messagingRemoteSurfaceActivation,
  );
  const showProgressPreview = Boolean(parsed.progressPreview && !hasStructuredBodyPreview);
  const showResultSection = shouldRenderToolResultSection({
    result: parsed.result,
    hasLargeOutputPreview: Boolean(parsed.largeOutputPreview),
    status,
  });
  return (
    <article className={`message tool status-${status ?? "done"}`}>
      <details className="tool-card" open={status === "running" || status === "error"}>
        <summary>
          <span className={`tool-status ${status ?? "done"}`}>
            <ToolStatusIcon status={status} />
          </span>
          <span className="tool-summary-body">
            <span className="tool-title-row">
              <strong>{toolName}</strong>
              {parsed.artifactPath && <span className="tool-artifact-pill">{fileBaseName(parsed.artifactPath)}</span>}
              {injectedPlaybookChip && (
                <span className="tool-workflow-playbook-chip" title={injectedPlaybookChip.tooltip}>
                  <Package size={12} />
                  <span>{injectedPlaybookChip.label}</span>
                </span>
              )}
              {browserTool && (
                <button
                  type="button"
                  className="tool-inline-action"
                  title="Show the Browser panel"
                  onClick={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    onOpenBrowserPanel();
                  }}
                >
                  <Monitor size={12} />
                  <span>Show browser</span>
                </button>
              )}
            </span>
            <small>{parsed.summary}</small>
            {parsed.argumentStatus && <span className="tool-argument-status">{parsed.argumentStatus}</span>}
            {parsed.preview && (
              <span className="tool-command-preview">
                <span>{parsed.inputTitle}</span>
                <code>{parsed.preview}</code>
              </span>
            )}
            {parsed.resultPreview && (
              <span className="tool-result-preview">
                <span>Output</span>
                <code>{parsed.resultPreview}</code>
              </span>
            )}
          </span>
        </summary>
        {parsed.input || showResultSection || parsed.largeOutputPreview || showProgressPreview || parsed.managedFileArtifacts.length > 0 ? (
          <div className="tool-output" onClick={(event) => event.stopPropagation()} onMouseDown={(event) => event.stopPropagation()}>
            {showProgressPreview && parsed.progressPreview ? <ToolProgressPreviewView preview={parsed.progressPreview} /> : null}
            {parsed.installRoutePreview ? (
              <ToolInstallRoutePreview preview={parsed.installRoutePreview} />
            ) : parsed.longformInputPreview ? (
              <ToolLongformInputPreviewView preview={parsed.longformInputPreview} running={status === "running"} />
            ) : parsed.editPreview ? (
              <ToolEditPreview preview={parsed.editPreview} running={status === "running"} />
            ) : parsed.voicePreview ? (
              <ToolVoicePreview preview={parsed.voicePreview} running={status === "running"} onOpenUrl={onOpenUrl} />
            ) : parsed.sttPreview ? (
              <ToolSttPreview preview={parsed.sttPreview} running={status === "running"} onPreviewPath={onPreviewPath} />
            ) : parsed.telegramSessionSetup ? (
              <ToolTelegramSessionSetupCard
                card={parsed.telegramSessionSetup}
                running={status === "running"}
                actionDisabled={toolActionDisabled}
                onSendPrompt={onSendTelegramSessionSetupPrompt}
              />
            ) : parsed.messagingConversationDirectorySetup ? (
              <ToolMessagingConversationDirectorySetupCard
                card={parsed.messagingConversationDirectorySetup}
                running={status === "running"}
              />
            ) : parsed.messagingRemoteSurfaceActivation ? (
              <ToolMessagingRemoteSurfaceActivationCard
                card={parsed.messagingRemoteSurfaceActivation}
                running={status === "running"}
                actionDisabled={toolActionDisabled}
                onSendPrompt={onSendRemoteSurfaceActivationPrompt}
              />
            ) : parsed.input ? (
              <ToolSection
                title={parsed.inputTitle}
                content={parsed.input}
                workspacePath={workspacePath}
                onPreviewPath={onPreviewPath}
                onPreviewLocalPath={onPreviewLocalPath}
                onOpenUrl={onOpenUrl}
                onOpenBrowserUrl={onOpenBrowserUrl}
              />
            ) : null}
            {parsed.largeOutputPreview && <ToolLargeOutputPreviewView preview={parsed.largeOutputPreview} onPreviewPath={onPreviewPath} />}
            {parsed.managedFileArtifacts.length > 0 && (
              <ToolManagedFileArtifactsPreview
                artifacts={parsed.managedFileArtifacts}
                onPreviewPath={onPreviewPath}
                onPreviewLocalPath={onPreviewLocalPath}
              />
            )}
            {showResultSection && (
              <ToolSection
                title="Result"
                content={parsed.result}
                workspacePath={workspacePath}
                onPreviewPath={onPreviewPath}
                onPreviewLocalPath={onPreviewLocalPath}
                onOpenUrl={onOpenUrl}
                onOpenBrowserUrl={onOpenBrowserUrl}
              />
            )}
          </div>
        ) : (
          <p className="panel-note">No output.</p>
        )}
      </details>
      {canPreviewArtifact && (
        <ArtifactPreviewStrip
          artifactPath={parsed.artifactPath!}
          generatedMediaAutoplay={generatedMediaAutoplay}
          onPreviewPath={onPreviewPath}
          onPreviewLocalPath={onPreviewLocalPath}
          onOpenMediaModal={onOpenMediaModal}
        />
      )}
    </article>
  );
}
