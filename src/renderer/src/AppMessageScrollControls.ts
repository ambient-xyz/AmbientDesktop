import { useCallback, useLayoutEffect, useRef, useState } from "react";
import type { MutableRefObject, RefObject } from "react";

import type { WelcomeOnboardingPageKind } from "../../shared/welcomeOnboarding";
import { RUN_ACTIVITY_SCROLL_THRESHOLD, scheduleScrollToBottom } from "./AppRunActivity";
import { SHOW_SCROLL_TO_BOTTOM_DISTANCE, isScrolledToBottom } from "./scrolling";
import { welcomeOnboardingPageShouldOpenAtTop } from "./welcomeSetupUiModel";

const HIDE_SCROLL_TO_BOTTOM_DISTANCE = 64;

export function shouldShowScrollToBottom(element: Pick<HTMLElement, "clientHeight" | "scrollHeight" | "scrollTop"> | null): boolean {
  return nextScrollToBottomVisibility(element, false);
}

export function nextScrollToBottomVisibility(
  element: Pick<HTMLElement, "clientHeight" | "scrollHeight" | "scrollTop"> | null,
  currentVisible: boolean,
): boolean {
  const distance = element ? element.scrollHeight - element.scrollTop - element.clientHeight : 0;
  return distance > (currentVisible ? HIDE_SCROLL_TO_BOTTOM_DISTANCE : SHOW_SCROLL_TO_BOTTOM_DISTANCE);
}

export function nextMessageTailVisibility(element: Pick<HTMLElement, "clientHeight" | "scrollHeight" | "scrollTop"> | null): boolean {
  return isScrolledToBottom(element, RUN_ACTIVITY_SCROLL_THRESHOLD);
}

export function shouldSettleMessageTailAfterVisibilityChange({
  element,
  messageTailVisible,
  shouldTailMessages,
}: {
  element: Pick<HTMLElement, "clientHeight" | "scrollHeight" | "scrollTop"> | null;
  messageTailVisible: boolean;
  shouldTailMessages: boolean;
}): boolean {
  return messageTailVisible && shouldTailMessages && !nextMessageTailVisibility(element);
}

export function shouldIgnoreProgrammaticMessagesScroll({
  element,
  programmaticScroll,
  shouldTailMessages,
}: {
  element: Pick<HTMLElement, "clientHeight" | "scrollHeight" | "scrollTop"> | null;
  programmaticScroll: boolean;
  shouldTailMessages: boolean;
}): boolean {
  return programmaticScroll && (shouldTailMessages || nextMessageTailVisibility(element));
}

export function shouldFollowMessageTailOnContentChange({
  forceTailMessages,
  messageTailVisible,
  shouldTailMessages,
}: {
  forceTailMessages: boolean;
  messageTailVisible: boolean;
  shouldTailMessages: boolean;
}): boolean {
  return (shouldTailMessages && messageTailVisible) || forceTailMessages;
}

export function shouldRequestMessageTail(threadId: string | undefined, activeThreadId: string | undefined): boolean {
  return Boolean(threadId && threadId === activeThreadId);
}

export function scrollControlsCollectionRevision(items: readonly unknown[] | undefined): string {
  if (!items?.length) return "0";
  const last = items[items.length - 1];
  if (!last || typeof last !== "object") return `${items.length}:primitive:${String(last)}`;
  const record = last as Record<string, unknown>;
  const content = typeof record.content === "string" ? record.content : undefined;
  const text = typeof record.text === "string" ? record.text : undefined;
  const id = typeof record.id === "string" || typeof record.id === "number" ? String(record.id) : "";
  const status = typeof record.status === "string" ? record.status : "";
  const kind = typeof record.kind === "string" ? record.kind : "";
  return `${items.length}:${id}:${kind}:${status}:${content?.length ?? ""}:${text?.length ?? ""}`;
}

export function useAppMessageScrollControls({
  activeRunActivityLines,
  activeThreadId,
  activeThreadIdRef,
  chatBrowserUserActionId,
  chatBrowserUserActionStatus,
  messages,
  welcomeOnboardingPageKind,
}: {
  activeRunActivityLines: readonly unknown[];
  activeThreadId: string | undefined;
  activeThreadIdRef: MutableRefObject<string | undefined>;
  chatBrowserUserActionId: string | undefined;
  chatBrowserUserActionStatus: string | undefined;
  messages: readonly unknown[] | undefined;
  welcomeOnboardingPageKind: WelcomeOnboardingPageKind | undefined;
}): {
  handleMessagesScroll: () => void;
  jumpToLatestMessage: () => void;
  requestMessageTail: (threadId?: string) => void;
  scrollRef: RefObject<HTMLDivElement | null>;
  messageTailVisible: boolean;
  showScrollToBottom: boolean;
} {
  const [messageTailVisible, setMessageTailVisible] = useState(true);
  const [showScrollToBottom, setShowScrollToBottom] = useState(false);
  const messageTailVisibleRef = useRef(true);
  const showScrollToBottomRef = useRef(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const shouldTailMessagesRef = useRef(true);
  const forceTailMessagesRef = useRef(false);
  const programmaticMessagesScrollRef = useRef(false);
  const visibilityFrameRef = useRef<number | undefined>(undefined);
  const contentChangeScrollCancelRef = useRef<(() => void) | undefined>(undefined);
  const contentChangeFrameRef = useRef<number | undefined>(undefined);
  const messagesRevision = scrollControlsCollectionRevision(messages);
  const activeRunActivityLinesRevision = scrollControlsCollectionRevision(activeRunActivityLines);
  messageTailVisibleRef.current = messageTailVisible;
  showScrollToBottomRef.current = showScrollToBottom;

  function setMessageTailIsVisible(nextVisible: boolean) {
    if (messageTailVisibleRef.current === nextVisible) return;
    messageTailVisibleRef.current = nextVisible;
    setMessageTailVisible(nextVisible);
  }

  function setScrollToBottomVisible(nextVisible: boolean) {
    if (showScrollToBottomRef.current === nextVisible) return;
    showScrollToBottomRef.current = nextVisible;
    setShowScrollToBottom(nextVisible);
  }

  function applyScrollToBottomVisibility(element: HTMLDivElement | null) {
    const nextVisible = nextScrollToBottomVisibility(element, showScrollToBottomRef.current);
    setScrollToBottomVisible(nextVisible);
    setMessageTailIsVisible(nextMessageTailVisibility(element));
  }

  function updateScrollToBottomVisibility(element: HTMLDivElement | null) {
    if (visibilityFrameRef.current !== undefined) window.cancelAnimationFrame(visibilityFrameRef.current);
    visibilityFrameRef.current = window.requestAnimationFrame(() => {
      visibilityFrameRef.current = undefined;
      applyScrollToBottomVisibility(element);
    });
  }

  useLayoutEffect(
    () => () => {
      if (visibilityFrameRef.current !== undefined) window.cancelAnimationFrame(visibilityFrameRef.current);
      if (contentChangeFrameRef.current !== undefined) window.cancelAnimationFrame(contentChangeFrameRef.current);
      contentChangeScrollCancelRef.current?.();
    },
    [],
  );

  useLayoutEffect(() => {
    if (!welcomeOnboardingPageShouldOpenAtTop(welcomeOnboardingPageKind)) return;
    const element = scrollRef.current;
    if (!element) return;
    shouldTailMessagesRef.current = false;
    forceTailMessagesRef.current = false;
    setMessageTailIsVisible(false);
    programmaticMessagesScrollRef.current = true;
    element.scrollTop = 0;
    const clearProgrammaticScroll = window.setTimeout(() => {
      programmaticMessagesScrollRef.current = false;
    }, 0);
    return () => {
      window.clearTimeout(clearProgrammaticScroll);
      programmaticMessagesScrollRef.current = false;
    };
  }, [activeThreadId, welcomeOnboardingPageKind]);

  useLayoutEffect(() => {
    if (welcomeOnboardingPageShouldOpenAtTop(welcomeOnboardingPageKind)) return;
    const forceTail = forceTailMessagesRef.current;
    if (!shouldTailMessagesRef.current && !forceTail) return;
    if (!messageTailVisibleRef.current && !forceTail) return;
    const element = scrollRef.current;
    if (!element) return;
    programmaticMessagesScrollRef.current = true;
    setScrollToBottomVisible(false);
    const cancel = scheduleScrollToBottom(element, () => {
      programmaticMessagesScrollRef.current = false;
      shouldTailMessagesRef.current = nextMessageTailVisibility(element);
      forceTailMessagesRef.current = shouldTailMessagesRef.current;
      setMessageTailIsVisible(shouldTailMessagesRef.current);
      setScrollToBottomVisible(false);
    });
    return () => {
      cancel();
      programmaticMessagesScrollRef.current = false;
    };
  }, [messagesRevision, activeRunActivityLinesRevision, chatBrowserUserActionId, chatBrowserUserActionStatus, welcomeOnboardingPageKind]);

  useLayoutEffect(() => {
    if (welcomeOnboardingPageShouldOpenAtTop(welcomeOnboardingPageKind)) return;
    const element = scrollRef.current;
    if (!element) return;

    const requestTailScrollForContentChange = () => {
      if (
        !shouldFollowMessageTailOnContentChange({
          forceTailMessages: forceTailMessagesRef.current,
          messageTailVisible: messageTailVisibleRef.current,
          shouldTailMessages: shouldTailMessagesRef.current,
        })
      ) {
        return;
      }
      if (contentChangeFrameRef.current !== undefined) return;
      contentChangeFrameRef.current = window.requestAnimationFrame(() => {
        contentChangeFrameRef.current = undefined;
        if (
          !shouldFollowMessageTailOnContentChange({
            forceTailMessages: forceTailMessagesRef.current,
            messageTailVisible: messageTailVisibleRef.current,
            shouldTailMessages: shouldTailMessagesRef.current,
          })
        ) {
          return;
        }
        programmaticMessagesScrollRef.current = true;
        setScrollToBottomVisible(false);
        contentChangeScrollCancelRef.current?.();
        contentChangeScrollCancelRef.current = scheduleScrollToBottom(element, () => {
          contentChangeScrollCancelRef.current = undefined;
          programmaticMessagesScrollRef.current = false;
          shouldTailMessagesRef.current = nextMessageTailVisibility(element);
          forceTailMessagesRef.current = forceTailMessagesRef.current && shouldTailMessagesRef.current;
          setMessageTailIsVisible(shouldTailMessagesRef.current);
          setScrollToBottomVisible(false);
        });
      });
    };

    const resizeObserver = new ResizeObserver(requestTailScrollForContentChange);
    resizeObserver.observe(element);
    for (const child of Array.from(element.children)) {
      if (child instanceof HTMLElement) resizeObserver.observe(child);
    }
    const mutationObserver = new MutationObserver(requestTailScrollForContentChange);
    mutationObserver.observe(element, {
      attributes: true,
      characterData: true,
      childList: true,
      subtree: true,
    });

    return () => {
      resizeObserver.disconnect();
      mutationObserver.disconnect();
      if (contentChangeFrameRef.current !== undefined) {
        window.cancelAnimationFrame(contentChangeFrameRef.current);
        contentChangeFrameRef.current = undefined;
      }
      contentChangeScrollCancelRef.current?.();
      contentChangeScrollCancelRef.current = undefined;
      programmaticMessagesScrollRef.current = false;
    };
  }, [activeThreadId, welcomeOnboardingPageKind]);

  useLayoutEffect(() => {
    if (welcomeOnboardingPageShouldOpenAtTop(welcomeOnboardingPageKind)) return;
    const element = scrollRef.current;
    if (
      !shouldSettleMessageTailAfterVisibilityChange({
        element,
        messageTailVisible,
        shouldTailMessages: shouldTailMessagesRef.current,
      })
    ) {
      return;
    }
    programmaticMessagesScrollRef.current = true;
    setScrollToBottomVisible(false);
    const cancel = scheduleScrollToBottom(element, () => {
      programmaticMessagesScrollRef.current = false;
      shouldTailMessagesRef.current = nextMessageTailVisibility(element);
      setMessageTailIsVisible(shouldTailMessagesRef.current);
      setScrollToBottomVisible(false);
    });
    return () => {
      cancel();
      programmaticMessagesScrollRef.current = false;
    };
  }, [messageTailVisible, welcomeOnboardingPageKind]);

  const handleMessagesScroll = useCallback(() => {
    const element = scrollRef.current;
    const nextShouldTailMessages = nextMessageTailVisibility(element);
    if (
      shouldIgnoreProgrammaticMessagesScroll({
        element,
        programmaticScroll: programmaticMessagesScrollRef.current,
        shouldTailMessages: shouldTailMessagesRef.current || forceTailMessagesRef.current,
      })
    ) {
      return;
    }
    if (programmaticMessagesScrollRef.current) programmaticMessagesScrollRef.current = false;
    if (!nextShouldTailMessages) forceTailMessagesRef.current = false;
    setMessageTailIsVisible(nextShouldTailMessages);
    if (shouldTailMessagesRef.current && nextShouldTailMessages) {
      updateScrollToBottomVisibility(element);
      return;
    }
    shouldTailMessagesRef.current = nextShouldTailMessages;
    updateScrollToBottomVisibility(element);
  }, []);

  const jumpToLatestMessage = useCallback(() => {
    const element = scrollRef.current;
    if (!element) return;
    shouldTailMessagesRef.current = true;
    forceTailMessagesRef.current = true;
    programmaticMessagesScrollRef.current = true;
    setMessageTailIsVisible(true);
    setScrollToBottomVisible(false);
    const cancel = scheduleScrollToBottom(element, () => {
      programmaticMessagesScrollRef.current = false;
      shouldTailMessagesRef.current = true;
      forceTailMessagesRef.current = true;
      setMessageTailIsVisible(true);
      setScrollToBottomVisible(false);
    });
    window.setTimeout(cancel, 500);
  }, []);

  const requestMessageTail = useCallback(
    (threadId = activeThreadIdRef.current) => {
      if (!shouldRequestMessageTail(threadId, activeThreadIdRef.current)) return;
      shouldTailMessagesRef.current = true;
      forceTailMessagesRef.current = true;
      const element = scrollRef.current;
      if (!element) return;
      programmaticMessagesScrollRef.current = true;
      setMessageTailIsVisible(true);
      setScrollToBottomVisible(false);
      const cancel = scheduleScrollToBottom(element, () => {
        programmaticMessagesScrollRef.current = false;
        shouldTailMessagesRef.current = true;
        forceTailMessagesRef.current = true;
        setMessageTailIsVisible(true);
        setScrollToBottomVisible(false);
      });
      window.setTimeout(cancel, 500);
    },
    [activeThreadIdRef],
  );

  return {
    handleMessagesScroll,
    jumpToLatestMessage,
    messageTailVisible,
    requestMessageTail,
    scrollRef,
    showScrollToBottom,
  };
}
