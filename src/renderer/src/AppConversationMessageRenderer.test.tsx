import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import type { ChatMessage } from "../../shared/threadTypes";
import { welcomeOnboardingMessageMetadata } from "../../shared/welcomeOnboarding";
import { AppConversationMessageRenderer, type AppConversationMessageRendererProps } from "./AppConversationMessageRenderer";
import type { SubagentParentClusterModel } from "./subagentParentClusterUiModel";

describe("AppConversationMessageRenderer", () => {
  it("renders welcome setup messages from onboarding metadata", () => {
    const markup = renderToStaticMarkup(
      <AppConversationMessageRenderer
        {...baseProps({
          message: assistantMessage({ metadata: welcomeOnboardingMessageMetadata("core_setup") }),
        })}
      />,
    );

    expect(markup).toContain("<h1>Core Setup</h1>");
    expect(markup).toContain("Start guided setup");
    expect(markup).toContain("Open Settings");
    expect(markup).not.toContain('class="message assistant"');
  });

  it("renders regular messages with their attached subagent cluster", () => {
    const markup = renderToStaticMarkup(
      <AppConversationMessageRenderer
        {...baseProps({
          message: assistantMessage({ content: "Parent answer with child work." }),
          subagentCluster: { parentMessageId: "message-1" } as SubagentParentClusterModel,
          renderSubagentParentCluster: () => <div className="test-subagent-cluster">Child cluster</div>,
        })}
      />,
    );

    expect(markup).toContain('data-message-id="message-1"');
    expect(markup).toContain("Parent answer with child work.");
    expect(markup).toContain('class="test-subagent-cluster"');
    expect(markup.indexOf("Parent answer with child work.")).toBeLessThan(markup.indexOf("Child cluster"));
  });
});

function baseProps(overrides: Partial<AppConversationMessageRendererProps> = {}): AppConversationMessageRendererProps {
  const noop = vi.fn();
  return {
    message: assistantMessage(),
    subagentCluster: undefined,
    renderSubagentParentCluster: () => null,
    running: false,
    providerCatalog: {
      cards: [],
      catalogVersion: "test-catalog",
      generatedAt: "2026-06-23T00:00:00.000Z",
    },
    welcomeAmbientPluginRegistry: undefined,
    onStartWelcomeFirstRunCapabilityOnboarding: noop,
    onStartWelcomeProviderCatalogCardOnboarding: noop,
    onStartWelcomeRemoteSurfaceActivation: noop,
    onOpenSettingsPanel: noop,
    onOpenPluginsPanel: noop,
    messageVoiceStates: {},
    voiceProviderLabels: {},
    streamingAssistantId: undefined,
    retryableMessageIds: new Set(["message-1"]),
    onRetryMessage: noop,
    onSendTelegramSessionSetupPrompt: undefined,
    onSendRemoteSurfaceActivationPrompt: undefined,
    activeWorkspacePath: "/workspace",
    onPreviewPath: noop,
    onPreviewLocalPath: noop,
    onOpenMediaModal: noop,
    generatedMediaAutoplay: false,
    latestReadyVoiceAutoplay: undefined,
    autoplayVoiceKey: undefined,
    activeVoiceMessageId: undefined,
    onActiveVoiceMessageChange: noop,
    onRegenerateVoice: noop,
    onRevealVoiceArtifact: noop,
    onClearVoiceArtifact: noop,
    onOpenUrl: noop,
    onOpenBrowserUrl: noop,
    onOpenBrowserPanel: noop,
    artifactPathHints: {},
    plannerArtifactByMessageId: new Map(),
    activeRunActivityLines: [],
    runStatus: "idle",
    onImplementPlannerPlan: noop,
    onRefinePlannerPlan: noop,
    onRetryPlannerFinalization: noop,
    onAddPlannerPlanToBoard: noop,
    onGeneratePlannerDurableArtifact: noop,
    hasProjectBoard: false,
    onAnswerPlannerDecisionQuestion: noop,
    chatFindOpen: false,
    chatFindQuery: "",
    contextRecoveryBusy: false,
    canRetryContextRecovery: false,
    onRecoverActiveThreadContext: noop,
    onRecoverAndRetryLatest: noop,
    onDuplicateActiveThreadFromTranscript: noop,
    showPromptCacheStatus: false,
    ...overrides,
  } as AppConversationMessageRendererProps;
}

function assistantMessage(overrides: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id: "message-1",
    threadId: "thread-1",
    role: "assistant",
    content: "Parent answer.",
    createdAt: "2026-06-23T00:00:00.000Z",
    ...overrides,
  } as ChatMessage;
}
