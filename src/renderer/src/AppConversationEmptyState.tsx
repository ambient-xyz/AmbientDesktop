import { ClipboardPaste, Download, Kanban, RefreshCw, Target, Zap } from "lucide-react";

import type { DesktopState } from "../../shared/desktopTypes";
import { ambientMiniLogoUrl } from "./AppBranding";
import { WorkflowRecorderEmptyChatState } from "./AppWorkflowRecording";

export interface AppConversationEmptyStateProps {
  workflowRecorderEmptyChatState?: { title: string; paragraphs: string[] };
  provider: DesktopState["provider"];
  onOpenAmbientKeys: () => void | Promise<void>;
  onOpenApiKeyDialog: () => void | Promise<void>;
}

export function AppConversationEmptyState({
  workflowRecorderEmptyChatState,
  provider,
  onOpenAmbientKeys,
  onOpenApiKeyDialog,
}: AppConversationEmptyStateProps) {
  if (workflowRecorderEmptyChatState) {
    return (
      <WorkflowRecorderEmptyChatState title={workflowRecorderEmptyChatState.title} paragraphs={workflowRecorderEmptyChatState.paragraphs}>
        {!provider.hasApiKey && (
          <SetupCallout provider={provider} onOpenAmbientKeys={onOpenAmbientKeys} onOpenApiKeyDialog={onOpenApiKeyDialog} />
        )}
      </WorkflowRecorderEmptyChatState>
    );
  }

  return (
    <div className="empty-state">
      <img className="ambient-mark large" src={ambientMiniLogoUrl} alt="" />
      <h1>Ambient</h1>
      <div className="empty-project-guidance">
        <p>Build iteratively in threads.</p>
        <p>
          When a project is ready for formal execution, click{" "}
          <span className="empty-guidance-icon" aria-label="Plan">
            <ClipboardPaste size={13} aria-hidden="true" />
            <span>Plan</span>
          </span>{" "}
          to create a durable plan.
        </p>
        <p>Then choose how you want Ambient to carry it out:</p>
        <p>
          <span className="empty-guidance-icon" aria-label="Goal mode loops">
            <Target size={13} aria-hidden="true" />
            <span>Goal mode loops</span>
          </span>{" "}
          can implement the plan fully autonomously, continuing until the goal is complete, blocked, or needs your input.
        </p>
        <p>
          <span className="empty-guidance-icon" aria-label="Project Board">
            <Kanban size={13} aria-hidden="true" />
            <span>Project Board</span>
          </span>{" "}
          turns the plan into visible Kanban work, giving you more control, approval points, and involvement as tasks move forward.
        </p>
        <p>
          Click{" "}
          <span className="empty-guidance-icon" aria-label="Full access">
            <Zap size={13} aria-hidden="true" />
          </span>{" "}
          to turn on full access mode when Ambient needs broader local permissions.
        </p>
        <p>
          Ambient is in beta. If you encounter problems, click{" "}
          <span className="empty-guidance-icon" aria-label="Download">
            <Download size={13} aria-hidden="true" />
          </span>{" "}
          to download a report and email it to support@ambientcrypto.ai.
        </p>
        <p>
          <span className="empty-guidance-icon" aria-label="Updates">
            <RefreshCw size={13} aria-hidden="true" />
          </span>{" "}
          Ambient updates itself; when an update is available, it appears in the upper-left corner.
        </p>
      </div>
      {!provider.hasApiKey && (
        <SetupCallout provider={provider} onOpenAmbientKeys={onOpenAmbientKeys} onOpenApiKeyDialog={onOpenApiKeyDialog} />
      )}
    </div>
  );
}

function SetupCallout({
  provider,
  onOpenAmbientKeys,
  onOpenApiKeyDialog,
}: {
  provider: DesktopState["provider"];
  onOpenAmbientKeys: () => void | Promise<void>;
  onOpenApiKeyDialog: () => void | Promise<void>;
}) {
  return (
    <div className="setup-callout">
      <p>Add a {provider.providerLabel} API key to start working.</p>
      <div>
        {provider.providerId === "ambient" && (
          <button type="button" onClick={() => void onOpenAmbientKeys()}>
            Get key
          </button>
        )}
        <button type="button" onClick={() => void onOpenApiKeyDialog()}>
          Paste key
        </button>
      </div>
    </div>
  );
}
