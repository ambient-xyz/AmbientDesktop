import { createRef } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import type { DesktopState } from "../../shared/desktopTypes";
import type { ChatMessage, RunStatus, ThreadGoal } from "../../shared/threadTypes";
import { AppConversationMessages } from "./AppConversationMessages";
import { subagentParentClusterFixtureModel } from "./SubagentParentCluster.fixture";
import type { SubagentThreadInspectorModel } from "./subagentThreadInspectorUiModel";

describe("AppConversationMessages", () => {
  it("renders the default empty conversation state and setup callout", () => {
    const markup = renderToStaticMarkup(
      <AppConversationMessages {...baseProps()}>
        <div className="composer-sentinel">Composer</div>
      </AppConversationMessages>,
    );

    expect(markup).toContain('class="conversation"');
    expect(markup).toContain('class="messages"');
    expect(markup).toContain("<h1>Ambient</h1>");
    expect(markup).toContain("Build iteratively in threads.");
    expect(markup).toContain("Goal mode loops");
    expect(markup).toContain("Project Board");
    expect(markup).toContain("support@ambientcrypto.ai");
    expect(markup).not.toContain("travis@ambientcrypto.ai");
    expect(markup).toContain("Add a Ambient API key to start working.");
    expect(markup).toContain("Get key");
    expect(markup).toContain("Paste key");
    expect(markup).toContain("composer-sentinel");
  });

  it("renders the workflow-recorder empty state when supplied", () => {
    const markup = renderToStaticMarkup(
      <AppConversationMessages
        {...baseProps({
          provider: provider({ hasApiKey: true }),
          workflowRecorderEmptyChatState: {
            title: "Workflow Recorder",
            paragraphs: ["Record the task once, then ask Ambient to draft a playbook."],
          },
        })}
      />,
    );

    expect(markup).toContain("<h1>Workflow Recorder</h1>");
    expect(markup).toContain("Record the task once, then ask Ambient to draft a playbook.");
    expect(markup).not.toContain("Add a Ambient API key to start working.");
  });

  it("anchors the jump-to-latest button above the composer boundary", () => {
    const markup = renderToStaticMarkup(
      <AppConversationMessages {...baseProps({ showScrollToBottom: true })}>
        <div className="composer-sentinel">Composer</div>
      </AppConversationMessages>,
    );

    expect(markup).toContain('class="scroll-to-bottom-anchor"');
    expect(markup).toContain('class="scroll-to-bottom-button"');
    expect(markup.indexOf('class="messages"')).toBeLessThan(markup.indexOf('class="scroll-to-bottom-anchor"'));
    expect(markup.indexOf('class="scroll-to-bottom-anchor"')).toBeLessThan(markup.indexOf("composer-sentinel"));
  });

  it("renders compaction status even when the run status card is hidden", () => {
    const markup = renderToStaticMarkup(
      <AppConversationMessages
        {...baseProps({
          provider: provider({ hasApiKey: true }),
          runStatus: "compacting",
          runStatusCardVisible: false,
          runtimeStatusIndicators: [
            {
              id: "compaction:thread-1",
              threadId: "thread-1",
              kind: "compaction",
              phase: "running",
              tone: "working",
              title: "Compacting context",
              message: "Ambient is compressing this chat before continuing.",
              startedAt: 1,
              updatedAt: 1,
            },
          ],
        })}
      />,
    );

    expect(markup).toContain('data-runtime-status-kind="compaction"');
    expect(markup).toContain('data-runtime-status-phase="running"');
    expect(markup).toContain("Compacting context");
    expect(markup).toContain("Ambient is compressing this chat before continuing.");
    expect(markup).not.toContain("run-activity-card default");
  });

  it("renders transient thinking only while the message tail is visible", () => {
    const transientThinkingActivityLines = [
      {
        id: "thinking-1",
        kind: "thinking",
        text: "Reading the latest tool result.",
        timestamp: 1,
      },
    ] as Parameters<typeof AppConversationMessages>[0]["transientThinkingActivityLines"];

    const visibleMarkup = renderToStaticMarkup(
      <AppConversationMessages
        {...baseProps({
          provider: provider({ hasApiKey: true }),
          running: true,
          runStatus: "streaming",
          messageTailVisible: true,
          transientThinkingActivityLines,
          visibleChatMessages: [parentAssistantMessage()],
        })}
      />,
    );
    const hiddenMarkup = renderToStaticMarkup(
      <AppConversationMessages
        {...baseProps({
          provider: provider({ hasApiKey: true }),
          running: true,
          runStatus: "streaming",
          messageTailVisible: false,
          transientThinkingActivityLines,
          visibleChatMessages: [parentAssistantMessage()],
        })}
      />,
    );

    expect(visibleMarkup).toContain("run-activity-card thinking-transient");
    expect(visibleMarkup).toContain("Reading the latest tool result.");
    expect(hiddenMarkup).not.toContain("run-activity-card thinking-transient");
    expect(hiddenMarkup).not.toContain("Reading the latest tool result.");
  });

  it("gates prompt cache status badges behind the model runtime setting", () => {
    const cachedMessage = parentAssistantMessage({
      promptCache: {
        status: "hit",
        usage: { input: 2048, cacheRead: 1536, cacheWrite: 0 },
      },
    });

    const hiddenMarkup = renderToStaticMarkup(
      <AppConversationMessages
        {...baseProps({
          provider: provider({ hasApiKey: true }),
          visibleChatMessages: [cachedMessage],
          showPromptCacheStatus: false,
        })}
      />,
    );
    const visibleMarkup = renderToStaticMarkup(
      <AppConversationMessages
        {...baseProps({
          provider: provider({ hasApiKey: true }),
          visibleChatMessages: [cachedMessage],
          showPromptCacheStatus: true,
        })}
      />,
    );

    expect(hiddenMarkup).not.toContain("Prompt cache hit");
    expect(visibleMarkup).toContain('data-message-id="message-1"');
    expect(visibleMarkup).toContain("message-prompt-cache-badge hit");
    expect(visibleMarkup).toContain("Prompt cache hit");
    expect(visibleMarkup).toContain("1,536 cached tokens");
  });

  it("renders automatic continuation status with the active goal turn count", () => {
    const markup = renderToStaticMarkup(
      <AppConversationMessages
        {...baseProps({
          activeThreadGoal: activeGoal({ continuationTurns: 4 }),
          provider: provider({ hasApiKey: true }),
          runtimeStatusIndicators: [
            {
              id: "goal-continuation:goal-1",
              threadId: "thread-1",
              kind: "goal-continuation",
              phase: "running",
              tone: "working",
              title: "Continuing goal",
              message: "Ambient is running an automatic continuation turn.",
              startedAt: 1,
              updatedAt: 2,
              goalId: "goal-1",
            },
          ],
        })}
      />,
    );

    expect(markup).toContain('data-runtime-status-kind="goal-continuation"');
    expect(markup).toContain("Continuing goal");
    expect(markup).toContain("automatic continuation turn.");
    expect(markup).toContain("Turn 4.");
  });

  it("renders live child transcripts from subagent cluster state", () => {
    const markup = renderToStaticMarkup(
      <AppConversationMessages
        {...baseProps({
          provider: provider({ hasApiKey: true }),
          visibleChatMessages: [parentAssistantMessage()],
          childMessagesByThreadId: {
            "child-thread-1": [childAssistantMessage(), childToolMessage()],
          },
          threads: [
            {
              id: "child-thread-1",
              title: "Reviewer",
              workspacePath: "/workspace/reviewer",
            },
          ] as DesktopState["threads"],
          subagentRunEvents: [
            {
              runId: "child-run-1",
              sequence: 1,
              type: "subagent.retry_child_session_starting",
              createdAt: "2026-06-13T00:00:01.000Z",
              preview: {
                previousStatus: "failed",
                messagePreview: "Retry in the same visible child thread.",
              },
            },
          ] as DesktopState["subagentRunEvents"],
          subagentMailboxEvents: [
            {
              id: "mailbox-task-1",
              runId: "child-run-1",
              direction: "parent_to_child",
              type: "subagent.task",
              payload: { task: "Bootstrap task stays out of the visible child mailbox timeline." },
              deliveryState: "queued",
              createdAt: "2026-06-13T00:00:01.500Z",
            },
            {
              id: "mailbox-followup-1",
              runId: "child-run-1",
              direction: "parent_to_child",
              type: "subagent.followup",
              payload: { messagePreview: "Parent follow-up remains visible inside the child timeline." },
              deliveryState: "delivered",
              createdAt: "2026-06-13T00:00:01.750Z",
              deliveredAt: "2026-06-13T00:00:01.800Z",
            },
          ] as DesktopState["subagentMailboxEvents"],
          threadRunStatuses: { "child-thread-1": "streaming" },
          runActivityLinesByThread: {
            "child-thread-1": [
              {
                id: "child-activity-1",
                kind: "thinking",
                text: "Child is reading the workspace file.",
                timestamp: 1,
              },
              {
                id: "child-activity-2",
                kind: "tool",
                text: "Workspace Read completed inside the child thread.",
                timestamp: 2,
              },
            ],
          },
          subagentParentClustersByMessageId: new Map([["message-1", subagentParentClusterFixtureModel()]]),
        })}
      />,
    );

    expect(markup).toContain("subagent-parent-cluster-child-transcript-live");
    const parentClusterDetails = markup.match(/<details class="subagent-parent-cluster"[^>]*>/)?.[0] ?? "";
    expect(parentClusterDetails).toContain('open=""');
    expect(parentClusterDetails).toContain('data-subagent-cluster-auto-open="true"');
    expect(parentClusterDetails).toContain('data-subagent-cluster-live-child-count="1"');
    const childDetails =
      markup.match(/<details class="subagent-parent-cluster-child-thread[^>]*data-child-run-id="child-run-1"[^>]*>/)?.[0] ?? "";
    expect(childDetails).toContain('open=""');
    expect(childDetails).toContain('data-child-live-transcript-auto-open="true"');
    expect(markup).toContain('data-child-run-id="child-run-1"');
    expect(markup).toContain('data-child-message-count="2"');
    expect(markup).toContain('data-child-tool-message-count="1"');
    expect(markup).toContain('data-child-renderer="message-bubble+tool-card"');
    expect(markup).toContain('data-child-run-activity-visible="true"');
    expect(markup).toContain('data-child-run-activity-placement="after-transcript"');
    expect(markup).toContain("2 activity lines");
    expect(markup).toContain("Live child activity for Reviewer");
    expect(markup).toContain("Child is reading the workspace file.");
    expect(markup).toContain("Workspace Read completed inside the child thread.");
    expect(markup).toContain('data-child-runtime-event-count="1"');
    expect(markup).toContain('data-child-transcript-primary="true"');
    expect(markup).toContain('data-child-runtime-events-open="true"');
    expect(markup).toContain('data-child-mailbox-events-open="true"');
    expect(markup).toContain('data-child-transcript-stream-live="true"');
    expect(markup).toContain('data-child-transcript-flow="messages-first"');
    expect(markup).toContain('data-child-secondary-flow="after-transcript-stream"');
    expect(markup).toContain('data-child-transcript-layout="transcript-first"');
    expect(markup).toContain('data-child-summary-follows="true"');
    expect(markup).toContain('data-child-blocker-panel="after-transcript"');
    expect(markup).toContain('<details class="subagent-parent-cluster-child-runtime-events"');
    expect(markup).toContain('open=""');
    expect(markup).toContain("Child transcript rendered inline for Reviewer.");
    expect(markup).toContain('class="tool-card"');
    expect(markup).toContain("Workspace Read");
    expect(markup).toContain("Child tool result rendered with parent tool-card chrome.");
    expect(markup).toContain("Retry child session starting");
    expect(markup).toContain("Retry in the same visible child thread.");
    expect(markup).toContain('data-child-mailbox-event-count="1"');
    expect(markup).toContain("1 mailbox event");
    expect(markup).toContain("Child mailbox");
    expect(markup).toContain("Parent follow-up queued");
    expect(markup).toContain("Parent follow-up remains visible inside the child timeline.");
    expect(markup).not.toContain("Bootstrap task stays out of the visible child mailbox timeline.");
    expect(markup.indexOf("Child transcript rendered inline for Reviewer.")).toBeLessThan(
      markup.indexOf('data-child-blocker-panel="after-transcript"'),
    );
    expect(markup.indexOf("Child tool result rendered with parent tool-card chrome.")).toBeLessThan(
      markup.indexOf('data-child-blocker-panel="after-transcript"'),
    );
    expect(markup.indexOf("Child tool result rendered with parent tool-card chrome.")).toBeLessThan(
      markup.indexOf('aria-label="Live child activity for Reviewer"'),
    );
    expect(markup.indexOf("Child mailbox")).toBeLessThan(markup.indexOf('data-child-blocker-panel="after-transcript"'));
    expect(markup.indexOf("Parent follow-up remains visible inside the child timeline.")).toBeLessThan(
      markup.indexOf('data-child-blocker-panel="after-transcript"'),
    );
  });

  it("gates inline child transcript prompt cache badges behind the model runtime setting", () => {
    const cachedChildMessage = childAssistantMessage({
      promptCache: {
        status: "miss",
        usage: { input: 2048, cacheRead: 0, cacheWrite: 0 },
      },
    });
    const childTranscriptProps = {
      provider: provider({ hasApiKey: true }),
      visibleChatMessages: [parentAssistantMessage()],
      childMessagesByThreadId: {
        "child-thread-1": [cachedChildMessage],
      },
      threads: [
        {
          id: "child-thread-1",
          title: "Reviewer",
          workspacePath: "/workspace/reviewer",
        },
      ] as DesktopState["threads"],
      threadRunStatuses: { "child-thread-1": "streaming" } satisfies Record<string, RunStatus>,
      subagentParentClustersByMessageId: new Map([["message-1", subagentParentClusterFixtureModel()]]),
    };

    const hiddenMarkup = renderToStaticMarkup(
      <AppConversationMessages
        {...baseProps({
          ...childTranscriptProps,
          showPromptCacheStatus: false,
        })}
      />,
    );
    const visibleMarkup = renderToStaticMarkup(
      <AppConversationMessages
        {...baseProps({
          ...childTranscriptProps,
          showPromptCacheStatus: true,
        })}
      />,
    );

    expect(hiddenMarkup).not.toContain("Prompt cache miss");
    expect(visibleMarkup).toContain("message-prompt-cache-badge miss");
    expect(visibleMarkup).toContain("Prompt cache miss");
  });

  it("auto-opens a running child transcript in the parent thread even without a blocker", () => {
    const model = subagentParentClusterFixtureModel();
    model.parentBlocking = undefined;
    model.barriers = [];
    model.mailboxActivities = [];
    model.patternGraphs = [];
    model.workflowTasks = [];
    model.status = "Running";
    model.statusTone = "active";
    model.summary = "1 child active";
    model.children = [
      {
        ...model.children[0]!,
        parentBlocker: undefined,
        status: "Running",
        runStatus: "running",
        statusTone: "active",
        isTerminal: false,
        isSynthesisSafe: false,
        preview: "Child is streaming its research.",
      },
    ];

    const markup = renderToStaticMarkup(
      <AppConversationMessages
        {...baseProps({
          provider: provider({ hasApiKey: true }),
          visibleChatMessages: [parentAssistantMessage()],
          childMessagesByThreadId: {
            "child-thread-1": [childAssistantMessage()],
          },
          threads: [
            {
              id: "child-thread-1",
              title: "Reviewer",
              workspacePath: "/workspace/reviewer",
            },
          ] as DesktopState["threads"],
          subagentRunEvents: [
            {
              runId: "child-run-1",
              sequence: 1,
              type: "subagent.child_session_running",
              createdAt: "2026-06-13T00:00:01.000Z",
              preview: {
                childThreadId: "child-thread-1",
                messagePreview: "Child Pi session is running in the visible child thread.",
              },
            },
          ] as DesktopState["subagentRunEvents"],
          threadRunStatuses: { "child-thread-1": "streaming" },
          runActivityLinesByThread: {
            "child-thread-1": [
              {
                id: "child-activity-1",
                kind: "thinking",
                text: "Child is producing live transcript evidence.",
                timestamp: 1,
              },
            ],
          },
          subagentParentClustersByMessageId: new Map([["message-1", model]]),
        })}
      />,
    );

    const parentClusterDetails = markup.match(/<details class="subagent-parent-cluster"[^>]*>/)?.[0] ?? "";
    const childDetails =
      markup.match(/<details class="subagent-parent-cluster-child-thread[^>]*data-child-run-id="child-run-1"[^>]*>/)?.[0] ?? "";
    expect(parentClusterDetails).toContain('open=""');
    expect(parentClusterDetails).toContain('data-subagent-cluster-auto-open="true"');
    expect(parentClusterDetails).toContain('data-subagent-cluster-live-child-count="1"');
    expect(childDetails).toContain('open=""');
    expect(childDetails).toContain('data-child-default-expanded="true"');
    expect(childDetails).toContain('data-child-live-transcript-auto-open="true"');
    expect(markup).toContain('data-child-transcript-primary="true"');
    expect(markup).toContain('data-child-transcript-stream-live="true"');
    expect(markup).toContain('data-child-run-activity-visible="true"');
    expect(markup).toContain("Child transcript rendered inline for Reviewer.");
    expect(markup).toContain("Child is producing live transcript evidence.");
    expect(markup).not.toContain('data-child-blocker-panel="after-transcript"');
  });

  it("renders subagent clusters whose placeholder assistant anchor is hidden", () => {
    const cluster = subagentParentClusterFixtureModel();
    cluster.parentMessageId = "hidden-empty-assistant";
    cluster.parentBlocking = undefined;
    cluster.status = "Waiting on children";
    cluster.statusTone = "active";
    cluster.summary = "2 children · Waiting on Drafter: Completed, Verifier: Running";
    cluster.workflowTasks = [
      {
        ...cluster.workflowTasks[0],
        modeLabel: "Background",
        parentBlocker: undefined,
        childWait: {
          label: "Waiting on Symphony children",
          detail: "Workflow is waiting on child runs.",
          statusTone: "active",
          childLabels: ["Drafter: Completed", "Verifier: Running"],
        },
      },
    ];

    const markup = renderToStaticMarkup(
      <AppConversationMessages
        {...baseProps({
          provider: provider({ hasApiKey: true }),
          visibleChatMessages: [
            {
              id: "visible-response",
              threadId: "parent-thread",
              role: "assistant",
              content: "Queued the Symphony Imitate and Verify workflow.",
              createdAt: "2026-06-13T00:00:01.000Z",
            },
          ],
          subagentParentClustersByMessageId: new Map([["hidden-empty-assistant", cluster]]),
        })}
      />,
    );

    expect(markup).toContain("Queued the Symphony Imitate and Verify workflow.");
    expect(markup).toContain('class="subagent-parent-cluster"');
    expect(markup).toContain('data-subagent-cluster-auto-open="true"');
    expect(markup).toContain("Waiting on Drafter: Completed, Verifier: Running");
    expect(markup).toContain("Waiting on Symphony children");
  });

  it("keeps opened child thread transcripts ahead of collapsed run details", () => {
    const markup = renderToStaticMarkup(
      <AppConversationMessages
        {...baseProps({
          provider: provider({ hasApiKey: true }),
          activeSubagentInspector: activeSubagentInspector(),
          visibleChatMessages: [
            {
              id: "child-open-message-1",
              threadId: "child-thread-1",
              role: "assistant",
              content: "Opened child thread transcript is the primary surface.",
              createdAt: "2026-06-13T00:00:03.000Z",
            },
          ],
        })}
      >
        <div className="composer-sentinel">Composer</div>
      </AppConversationMessages>,
    );

    expect(markup).toContain('class="conversation subagent-inspector-docked"');
    expect(markup).toContain('class="messages"');
    expect(markup).toContain('class="subagent-thread-inspector-dock"');
    expect(markup).toContain('class="subagent-thread-inspector"');
    expect(markup).toContain('data-subagent-parent-thread-id="parent-thread"');
    expect(markup).toContain('data-subagent-parent-barrier-visible="true"');
    expect(markup).toContain("Parent waiting on this child");
    expect(markup).toContain("Open parent thread parent-thread");
    expect(markup).toContain("Opened child thread transcript is the primary surface.");
    expect(markup).not.toContain('<details class="subagent-thread-inspector" aria-label="Sub-agent run details" open');
    expect(markup).not.toContain("<h1>Ambient</h1>");
    expect(markup.indexOf('class="messages"')).toBeLessThan(markup.indexOf("Opened child thread transcript is the primary surface."));
    expect(markup.indexOf("Opened child thread transcript is the primary surface.")).toBeLessThan(
      markup.indexOf('class="subagent-thread-inspector-dock"'),
    );
    expect(markup.indexOf('class="subagent-thread-inspector-dock"')).toBeLessThan(markup.indexOf('class="subagent-thread-inspector"'));
    expect(markup.indexOf('class="subagent-thread-inspector"')).toBeLessThan(markup.indexOf("composer-sentinel"));
  });

  it("renders a live child-thread starting state before the first transcript message arrives", () => {
    const markup = renderToStaticMarkup(
      <AppConversationMessages
        {...baseProps({
          provider: provider({ hasApiKey: true }),
          activeSubagentInspector: activeSubagentInspector(),
          visibleChatMessages: [],
          running: true,
          runStatus: "streaming",
          activeRunActivityLines: [
            {
              id: "child-starting-activity-1",
              kind: "state",
              text: "Child Pi session is starting in the visible child thread.",
              timestamp: 1,
            },
          ],
        })}
      />,
    );

    expect(markup).toContain('data-subagent-child-starting-state="true"');
    expect(markup).toContain('data-subagent-child-run-id="child-run-1"');
    expect(markup).toContain('data-subagent-child-status="Running"');
    expect(markup).toContain('data-subagent-child-activity-count="1"');
    expect(markup).toContain("Child run is starting");
    expect(markup).toContain("Parent waiting on this child: Blocking: child running");
    expect(markup).toContain("Child Pi session is starting in the visible child thread.");
    expect(markup).toContain('class="message run-activity default"');
    expect(markup).toContain('class="subagent-thread-inspector"');
    expect(markup).not.toContain("<h1>Ambient</h1>");
    expect(markup).not.toContain("Waiting for the first child stream event...");
    expect(markup.indexOf('data-subagent-child-starting-state="true"')).toBeLessThan(markup.indexOf('class="subagent-thread-inspector"'));
  });
});

function baseProps(overrides: Partial<Parameters<typeof AppConversationMessages>[0]> = {}): Parameters<typeof AppConversationMessages>[0] {
  const noop = vi.fn();
  return {
    goalCompletionCelebrationId: undefined,
    chatFindOpen: false,
    chatFindInputRef: createRef<HTMLInputElement>(),
    chatFindQuery: "",
    chatFindCount: 0,
    chatFindIndex: 0,
    onChatFindQueryChange: noop,
    onChatFindPrevious: noop,
    onChatFindNext: noop,
    onChatFindClose: noop,
    activeThreadVoiceStatusVisible: false,
    activeThreadVoiceStatus: undefined,
    activeThreadVoiceStatusDismissKey: undefined,
    onDismissActiveThreadVoiceStatus: noop,
    activeSubagentInspector: undefined,
    workflowRecording: undefined,
    workflowRecordingReviewRunning: false,
    running: false,
    abortArmed: false,
    activeThreadId: "thread-1",
    activeThreadGoal: undefined,
    activeRunActivityLines: [],
    runStatus: "idle",
    retryStats: undefined,
    chatExportBusy: false,
    onRetryWorkflowRecordingReview: noop,
    onAbortRun: noop,
    onStopWorkflowRecording: noop,
    onExportActiveChat: noop,
    scrollRef: createRef<HTMLDivElement>(),
    onMessagesScroll: noop,
    visibleChatMessages: [],
    activeChatBrowserUserAction: undefined,
    workflowRecorderEmptyChatState: undefined,
    provider: provider(),
    providerCatalog: {
      cards: [],
      catalogVersion: "test-catalog",
      generatedAt: "2026-06-13T00:00:00.000Z",
    } as DesktopState["providerCatalog"],
    welcomeAmbientPluginRegistry: undefined,
    onOpenAmbientKeys: noop,
    onOpenApiKeyDialog: noop,
    onStartWelcomeFirstRunCapabilityOnboarding: noop,
    onStartWelcomeProviderCatalogCardOnboarding: noop,
    onStartWelcomeRemoteSurfaceActivation: noop,
    onOpenSettingsPanel: noop,
    onOpenPluginsPanel: noop,
    messageVoiceStates: {},
    voiceProviderLabels: {},
    streamingAssistantId: undefined,
    retryableMessageIds: new Set(),
    onRetryMessage: noop,
    onSendTelegramSessionSetupPrompt: noop,
    onSendRemoteSurfaceActivationPrompt: noop,
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
    artifactPathHints: new Map(),
    plannerArtifactByMessageId: new Map(),
    onImplementPlannerPlan: noop,
    onRefinePlannerPlan: noop,
    onRetryPlannerFinalization: noop,
    onAddPlannerPlanToBoard: noop,
    onGeneratePlannerDurableArtifact: noop,
    hasProjectBoard: false,
    onAnswerPlannerDecisionQuestion: noop,
    contextRecoveryBusy: false,
    canRetryContextRecovery: false,
    onRecoverActiveThreadContext: noop,
    onRecoverAndRetryLatest: noop,
    onDuplicateActiveThreadFromTranscript: noop,
    childMessagesByThreadId: {},
    threads: [] as DesktopState["threads"],
    subagentRunEvents: [] as DesktopState["subagentRunEvents"],
    subagentMailboxEvents: [] as DesktopState["subagentMailboxEvents"],
    threadRunStatuses: {},
    thinkingDisplayMode: "transient",
    runActivityLinesByThread: {},
    subagentParentClustersByMessageId: new Map(),
    onOpenSubagentThread: noop,
    onOpenSubagentParentThread: noop,
    onCancelSubagentChild: noop,
    onCloseSubagentChild: noop,
    onOpenCallableWorkflowThread: noop,
    onPauseCallableWorkflowTask: noop,
    onResumeCallableWorkflowTask: noop,
    onCancelCallableWorkflowTask: noop,
    onResolveSubagentBarrierAction: noop,
    onResolveSubagentApprovalAction: noop,
    subagentChildCancelBusy: undefined,
    subagentChildCloseBusy: undefined,
    callableWorkflowTaskPauseBusy: undefined,
    callableWorkflowTaskResumeBusy: undefined,
    callableWorkflowTaskCancelBusy: undefined,
    subagentBarrierActionBusy: undefined,
    subagentApprovalActionBusy: undefined,
    chatBrowserUserActionBusy: undefined,
    onResumeBrowserUserAction: noop,
    onCancelBrowserUserAction: noop,
    onOpenBrowserForUserAction: noop,
    transientThinkingActivityLines: [],
    visibleRunActivityLines: [],
    runStatusCardVisible: false,
    messageTailVisible: true,
    showScrollToBottom: false,
    onJumpToLatestMessage: noop,
    errorNeedsSessionRecovery: false,
    error: undefined,
    onDismissError: noop,
    activeWorkspaceIsPreparedLocalTask: false,
    projectRootPath: "/workspace",
    runtimeStatusIndicators: [],
    activeActivity: undefined,
    ...overrides,
  };
}

function parentAssistantMessage(metadata?: ChatMessage["metadata"]): ChatMessage {
  return {
    id: "message-1",
    threadId: "parent-thread",
    role: "assistant",
    content: "Ambient is coordinating the parent task while required child work stays inspectable.",
    createdAt: "2026-06-13T00:00:00.000Z",
    metadata,
  };
}

function childAssistantMessage(metadata?: ChatMessage["metadata"]): ChatMessage {
  return {
    id: "child-inline-message-1",
    threadId: "child-thread-1",
    role: "assistant",
    content: "Child transcript rendered inline for Reviewer.",
    createdAt: "2026-06-13T00:00:02.000Z",
    metadata,
  };
}

function childToolMessage(): ChatMessage {
  return {
    id: "child-inline-tool-1",
    threadId: "child-thread-1",
    role: "tool",
    content: [
      "Workspace Read done",
      "",
      "Input",
      '{"path":"src/example.ts"}',
      "",
      "Result",
      "Child tool result rendered with parent tool-card chrome.",
    ].join("\n"),
    createdAt: "2026-06-13T00:00:02.500Z",
    metadata: { toolName: "Workspace Read", status: "done" },
  };
}

function activeGoal(input: Partial<ThreadGoal> = {}): ThreadGoal {
  return {
    threadId: "thread-1",
    goalId: "goal-1",
    objective: "Test durable goal",
    status: "active",
    tokensUsed: 0,
    timeUsedSeconds: 0,
    continuationTurns: 1,
    noProgressTurns: 0,
    createdAt: "2026-06-22T00:00:00.000Z",
    updatedAt: "2026-06-22T00:00:00.000Z",
    ...input,
  };
}

function activeSubagentInspector(): SubagentThreadInspectorModel {
  return {
    runId: "child-run-1",
    parentThreadId: "parent-thread",
    parentWorkspacePath: "/workspace",
    title: "Reviewer sub-agent",
    status: "Running",
    statusTone: "active",
    parentBarrier: {
      label: "Parent waiting on this child",
      detail: "Blocking: child running · Required all",
      tone: "active",
    },
    badges: ["Required", "Cloud", "Tool-capable", "Open"],
    rows: [{ label: "Parent thread", value: "parent-thread" }],
    recentEvents: [{ key: "child-run-1:1", label: "Session Started", value: "Visible child thread is running." }],
    toolScopeRows: [],
    modelScopeRows: [],
    waitBarrierRows: [],
    repairRows: [],
  };
}

function provider(overrides: Partial<DesktopState["provider"]> = {}): DesktopState["provider"] {
  return {
    providerId: "ambient",
    providerLabel: "Ambient",
    hasApiKey: false,
    checking: false,
    error: undefined,
    ...overrides,
  } as DesktopState["provider"];
}
