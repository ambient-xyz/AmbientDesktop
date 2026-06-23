import type { ReactNode } from "react";

import type { ChatMessage } from "../../shared/threadTypes";
import { welcomeOnboardingPageKindFromMetadata } from "../../shared/welcomeOnboarding";
import type { AppConversationMessagesProps } from "./AppConversationMessages";
import { MessageBubble, messageIsStreamingForRender } from "./AppMessages";
import { WelcomeSetupMessage } from "./AppWelcomeSetup";
import type { SubagentParentClusterModel } from "./subagentParentClusterUiModel";

type AppConversationMessageRendererInheritedProps = Pick<
  AppConversationMessagesProps,
  | "running"
  | "providerCatalog"
  | "welcomeAmbientPluginRegistry"
  | "onStartWelcomeFirstRunCapabilityOnboarding"
  | "onStartWelcomeProviderCatalogCardOnboarding"
  | "onStartWelcomeRemoteSurfaceActivation"
  | "onOpenSettingsPanel"
  | "onOpenPluginsPanel"
  | "messageVoiceStates"
  | "voiceProviderLabels"
  | "streamingAssistantId"
  | "retryableMessageIds"
  | "onRetryMessage"
  | "onSendTelegramSessionSetupPrompt"
  | "onSendRemoteSurfaceActivationPrompt"
  | "activeWorkspacePath"
  | "onPreviewPath"
  | "onPreviewLocalPath"
  | "onOpenMediaModal"
  | "generatedMediaAutoplay"
  | "latestReadyVoiceAutoplay"
  | "autoplayVoiceKey"
  | "activeVoiceMessageId"
  | "onActiveVoiceMessageChange"
  | "onRegenerateVoice"
  | "onRevealVoiceArtifact"
  | "onClearVoiceArtifact"
  | "onOpenUrl"
  | "onOpenBrowserUrl"
  | "onOpenBrowserPanel"
  | "artifactPathHints"
  | "plannerArtifactByMessageId"
  | "activeRunActivityLines"
  | "runStatus"
  | "onImplementPlannerPlan"
  | "onRefinePlannerPlan"
  | "onRetryPlannerFinalization"
  | "onAddPlannerPlanToBoard"
  | "onGeneratePlannerDurableArtifact"
  | "hasProjectBoard"
  | "onAnswerPlannerDecisionQuestion"
  | "chatFindOpen"
  | "chatFindQuery"
  | "contextRecoveryBusy"
  | "canRetryContextRecovery"
  | "onRecoverActiveThreadContext"
  | "onRecoverAndRetryLatest"
  | "onDuplicateActiveThreadFromTranscript"
  | "showPromptCacheStatus"
>;

export type AppConversationMessageRendererProps = AppConversationMessageRendererInheritedProps & {
  message: ChatMessage;
  subagentCluster?: SubagentParentClusterModel;
  renderSubagentParentCluster: (subagentCluster: SubagentParentClusterModel) => ReactNode;
};

export function AppConversationMessageRenderer({
  message,
  subagentCluster,
  renderSubagentParentCluster,
  running,
  providerCatalog,
  welcomeAmbientPluginRegistry,
  onStartWelcomeFirstRunCapabilityOnboarding,
  onStartWelcomeProviderCatalogCardOnboarding,
  onStartWelcomeRemoteSurfaceActivation,
  onOpenSettingsPanel,
  onOpenPluginsPanel,
  messageVoiceStates,
  voiceProviderLabels,
  streamingAssistantId,
  retryableMessageIds,
  onRetryMessage,
  onSendTelegramSessionSetupPrompt,
  onSendRemoteSurfaceActivationPrompt,
  activeWorkspacePath,
  onPreviewPath,
  onPreviewLocalPath,
  onOpenMediaModal,
  generatedMediaAutoplay,
  latestReadyVoiceAutoplay,
  autoplayVoiceKey,
  activeVoiceMessageId,
  onActiveVoiceMessageChange,
  onRegenerateVoice,
  onRevealVoiceArtifact,
  onClearVoiceArtifact,
  onOpenUrl,
  onOpenBrowserUrl,
  onOpenBrowserPanel,
  artifactPathHints,
  plannerArtifactByMessageId,
  activeRunActivityLines,
  runStatus,
  onImplementPlannerPlan,
  onRefinePlannerPlan,
  onRetryPlannerFinalization,
  onAddPlannerPlanToBoard,
  onGeneratePlannerDurableArtifact,
  hasProjectBoard,
  onAnswerPlannerDecisionQuestion,
  chatFindOpen,
  chatFindQuery,
  contextRecoveryBusy,
  canRetryContextRecovery,
  onRecoverActiveThreadContext,
  onRecoverAndRetryLatest,
  onDuplicateActiveThreadFromTranscript,
  showPromptCacheStatus,
}: AppConversationMessageRendererProps) {
  const welcomePageKind = welcomeOnboardingPageKindFromMetadata(message.metadata);
  if (welcomePageKind === "core_setup" || welcomePageKind === "plugin_setup") {
    return (
      <WelcomeSetupMessage
        pageKind={welcomePageKind}
        catalogCards={providerCatalog.cards}
        catalogVersion={providerCatalog.catalogVersion}
        generatedAt={providerCatalog.generatedAt}
        running={running}
        registry={welcomeAmbientPluginRegistry}
        onStartFirstRun={onStartWelcomeFirstRunCapabilityOnboarding}
        onStartProviderCard={onStartWelcomeProviderCatalogCardOnboarding}
        onStartRemoteSurfaceActivation={onStartWelcomeRemoteSurfaceActivation}
        onOpenSettings={onOpenSettingsPanel}
        onOpenPlugins={onOpenPluginsPanel}
        onOpenCapabilityBuilder={onOpenPluginsPanel}
      />
    );
  }

  return (
    <>
      <MessageBubble
        message={message}
        voiceState={messageVoiceStates[message.id]}
        voiceProviderLabels={voiceProviderLabels}
        streaming={messageIsStreamingForRender(message, running, streamingAssistantId)}
        retryable={retryableMessageIds.has(message.id) && !running}
        onRetry={onRetryMessage}
        toolActionDisabled={running}
        onSendTelegramSessionSetupPrompt={onSendTelegramSessionSetupPrompt}
        onSendRemoteSurfaceActivationPrompt={onSendRemoteSurfaceActivationPrompt}
        workspacePath={activeWorkspacePath}
        onPreviewPath={onPreviewPath}
        onPreviewLocalPath={onPreviewLocalPath}
        onOpenMediaModal={onOpenMediaModal}
        generatedMediaAutoplay={generatedMediaAutoplay}
        voiceShouldAutoplay={message.id === latestReadyVoiceAutoplay?.messageId && autoplayVoiceKey === latestReadyVoiceAutoplay?.key}
        activeVoiceMessageId={activeVoiceMessageId}
        onActiveVoiceMessageChange={onActiveVoiceMessageChange}
        onRegenerateVoice={onRegenerateVoice}
        onRevealVoiceArtifact={onRevealVoiceArtifact}
        onClearVoiceArtifact={onClearVoiceArtifact}
        onOpenUrl={onOpenUrl}
        onOpenBrowserUrl={onOpenBrowserUrl}
        onOpenBrowserPanel={onOpenBrowserPanel}
        artifactPathHints={artifactPathHints}
        plannerPlanArtifact={plannerArtifactByMessageId.get(message.id)}
        runActivityLines={activeRunActivityLines}
        runStatus={runStatus}
        onImplementPlannerPlan={onImplementPlannerPlan}
        onRefinePlannerPlan={onRefinePlannerPlan}
        onRetryPlannerFinalization={onRetryPlannerFinalization}
        onAddPlannerPlanToBoard={onAddPlannerPlanToBoard}
        onGeneratePlannerDurableArtifact={onGeneratePlannerDurableArtifact}
        hasProjectBoard={hasProjectBoard}
        onAnswerPlannerDecisionQuestion={onAnswerPlannerDecisionQuestion}
        highlightQuery={chatFindOpen ? chatFindQuery : ""}
        contextRecoveryBusy={contextRecoveryBusy}
        contextRecoveryCanRetry={canRetryContextRecovery}
        onRecoverContext={onRecoverActiveThreadContext}
        onRecoverContextAndRetry={onRecoverAndRetryLatest}
        onDuplicateThreadFromTranscript={onDuplicateActiveThreadFromTranscript}
        showPromptCacheStatus={showPromptCacheStatus}
      />
      {subagentCluster && renderSubagentParentCluster(subagentCluster)}
    </>
  );
}
