import { Fragment, useLayoutEffect, useRef, useState } from "react";

import type { ChatMessage, RunStatus } from "../../shared/threadTypes";
import { BrowserUserActionChatCard } from "./AppChatChrome";
import { AppConversationEmptyState } from "./AppConversationEmptyState";
import { AppConversationMessageRenderer } from "./AppConversationMessageRenderer";
import type { AppConversationMessagesProps } from "./AppConversationMessages";
import { AppConversationSubagentChildStartingState, useAppConversationSubagentSurfaces } from "./AppConversationSubagentSurfaces";
import { RunActivityFeed, type RunActivityLine } from "./AppRunActivity";
import { shouldVirtualizeMessages, useVirtualMessageRows } from "./messageVirtualization";

function TransientThinkingActivitySlot({ lines, status, visible }: { lines: RunActivityLine[]; status: RunStatus; visible: boolean }) {
  const slotRef = useRef<HTMLDivElement>(null);
  const slotMinHeightRef = useRef(0);
  const [slotMinHeight, setSlotMinHeight] = useState(0);

  useLayoutEffect(() => {
    if (!visible) return;
    const element = slotRef.current;
    if (!element) return;
    const updateSlotHeight = () => {
      const nextHeight = Math.ceil(element.getBoundingClientRect().height);
      if (nextHeight <= 0) return;
      if (slotMinHeightRef.current === nextHeight) return;
      slotMinHeightRef.current = nextHeight;
      setSlotMinHeight(nextHeight);
    };
    updateSlotHeight();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(updateSlotHeight);
    observer.observe(element);
    return () => observer.disconnect();
  }, [lines.length, status, visible]);

  if (!visible && slotMinHeight <= 0) return null;

  return (
    <div
      className="transient-thinking-slot"
      ref={slotRef}
      aria-hidden={visible ? undefined : true}
      style={!visible && slotMinHeight > 0 ? { minHeight: slotMinHeight } : undefined}
    >
      {visible ? <RunActivityFeed lines={lines} status={status} variant="thinking-transient" /> : null}
    </div>
  );
}

export function AppConversationMessageList({ scrollRef, onMessagesScroll, ...messageListProps }: AppConversationMessagesProps) {
  const {
    activeSubagentInspector,
    activeChatBrowserUserAction,
    activeRunActivityLines,
    onCancelBrowserUserAction,
    onOpenAmbientKeys,
    onOpenApiKeyDialog,
    onOpenBrowserForUserAction,
    onResumeBrowserUserAction,
    provider,
    runStatus,
    visibleChatMessages,
    workflowRecorderEmptyChatState,
    chatFindOpen,
    chatBrowserUserActionBusy,
    messageTailVisible,
    messageWindow,
    onLoadOlderMessages,
    runStatusCardVisible,
    streamingAssistantId,
    subagentParentClustersByMessageId,
    transientThinkingActivityLines,
    visibleRunActivityLines,
    workflowRecordingReviewRunning,
    running,
  } = messageListProps;
  const [olderMessagesLoading, setOlderMessagesLoading] = useState(false);
  const olderMessagesAvailable = Boolean(
    messageWindow?.threadId === messageListProps.activeThreadId &&
      messageWindow.hasMoreBefore &&
      visibleChatMessages.length > 0 &&
      !activeSubagentInspector,
  );

  async function loadOlderMessages(): Promise<void> {
    if (olderMessagesLoading) return;
    setOlderMessagesLoading(true);
    try {
      await onLoadOlderMessages();
    } finally {
      setOlderMessagesLoading(false);
    }
  }

  const subagentThreadHasNoMessages = Boolean(activeSubagentInspector && visibleChatMessages.length === 0);
  const activeVirtualMessageIds = new Set<string>();
  if (streamingAssistantId) activeVirtualMessageIds.add(streamingAssistantId);
  const latestMessage = visibleChatMessages[visibleChatMessages.length - 1];
  if (running && latestMessage) activeVirtualMessageIds.add(latestMessage.id);
  const virtualMessagesEnabled = shouldVirtualizeMessages({
    messageCount: visibleChatMessages.length,
    chatFindOpen,
    activeSubagentInspector: Boolean(activeSubagentInspector),
  });
  const virtualMessages = useVirtualMessageRows({
    items: visibleChatMessages,
    scrollRef,
    enabled: virtualMessagesEnabled,
    activeIds: activeVirtualMessageIds,
  });
  const { orphanedSubagentClusters, renderSubagentParentCluster } = useAppConversationSubagentSurfaces(messageListProps);
  const activityTailVisible =
    (transientThinkingActivityLines.length > 0 && !workflowRecordingReviewRunning) || runStatusCardVisible;

  const renderConversationMessage = (message: ChatMessage) => (
    <AppConversationMessageRenderer
      {...messageListProps}
      message={message}
      subagentCluster={subagentParentClustersByMessageId.get(message.id)}
      renderSubagentParentCluster={renderSubagentParentCluster}
    />
  );

  return (
    <div className="messages" ref={scrollRef} onScroll={onMessagesScroll}>
      {visibleChatMessages.length === 0 && !activeChatBrowserUserAction?.active && !running && !activeSubagentInspector ? (
        <AppConversationEmptyState
          workflowRecorderEmptyChatState={workflowRecorderEmptyChatState}
          provider={provider}
          onOpenAmbientKeys={onOpenAmbientKeys}
          onOpenApiKeyDialog={onOpenApiKeyDialog}
        />
      ) : (
        <>
          {olderMessagesAvailable && (
            <div className="message-history-pagination">
              <button type="button" className="panel-button mini" disabled={olderMessagesLoading} onClick={() => void loadOlderMessages()}>
                {olderMessagesLoading ? "Loading older" : "Load older messages"}
              </button>
              <span>{messageWindow?.loadedCount ?? visibleChatMessages.length} loaded</span>
            </div>
          )}
          {virtualMessages.enabled ? (
            <div className="messages-virtual-list" style={{ height: virtualMessages.totalHeight }}>
              {virtualMessages.rows.map((row) => (
                <div
                  key={row.item.id}
                  className="messages-virtual-row"
                  data-message-id={row.item.id}
                  ref={(element) => virtualMessages.measureElement(row.item, element)}
                  style={{ transform: `translateY(${row.start}px)` }}
                >
                  {renderConversationMessage(row.item)}
                </div>
              ))}
            </div>
          ) : (
            visibleChatMessages.map((message) => <Fragment key={message.id}>{renderConversationMessage(message)}</Fragment>)
          )}
          {orphanedSubagentClusters.map((subagentCluster) => (
            <Fragment key={`orphan-subagent-cluster:${subagentCluster.parentMessageId}`}>
              {renderSubagentParentCluster(subagentCluster)}
            </Fragment>
          ))}
          {activeChatBrowserUserAction?.active && (
            <BrowserUserActionChatCard
              action={activeChatBrowserUserAction}
              busy={chatBrowserUserActionBusy}
              onResume={onResumeBrowserUserAction}
              onCancel={onCancelBrowserUserAction}
              onOpenBrowser={() => onOpenBrowserForUserAction(activeChatBrowserUserAction)}
            />
          )}
          {activityTailVisible && <div className="messages-tail-spacer" aria-hidden="true" />}
          {transientThinkingActivityLines.length > 0 && !workflowRecordingReviewRunning && (
            <TransientThinkingActivitySlot lines={transientThinkingActivityLines} status={runStatus} visible={messageTailVisible} />
          )}
          {runStatusCardVisible && <RunActivityFeed lines={visibleRunActivityLines} status={runStatus} />}
        </>
      )}
      {subagentThreadHasNoMessages && activeSubagentInspector && (
        <AppConversationSubagentChildStartingState
          model={activeSubagentInspector}
          runStatus={runStatus}
          activeRunActivityLines={activeRunActivityLines}
        />
      )}
    </div>
  );
}
