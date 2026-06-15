import { useLayoutEffect, useRef, useState } from "react";
import type { MutableRefObject, RefObject } from "react";

import type { WelcomeOnboardingPageKind } from "../../shared/welcomeOnboarding";
import {
  RUN_ACTIVITY_SCROLL_THRESHOLD,
  scheduleScrollToBottom,
} from "./AppRunActivity";
import {
  SHOW_SCROLL_TO_BOTTOM_DISTANCE,
  isScrolledToBottom,
} from "./scrolling";
import { welcomeOnboardingPageShouldOpenAtTop } from "./welcomeSetupUiModel";

export function shouldShowScrollToBottom(
  element: Pick<HTMLElement, "clientHeight" | "scrollHeight" | "scrollTop"> | null,
): boolean {
  const distance = element ? element.scrollHeight - element.scrollTop - element.clientHeight : 0;
  return distance > SHOW_SCROLL_TO_BOTTOM_DISTANCE;
}

export function shouldRequestMessageTail(threadId: string | undefined, activeThreadId: string | undefined): boolean {
  return Boolean(threadId && threadId === activeThreadId);
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
  showScrollToBottom: boolean;
} {
  const [showScrollToBottom, setShowScrollToBottom] = useState(false);
  const showScrollToBottomRef = useRef(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const shouldTailMessagesRef = useRef(true);
  const programmaticMessagesScrollRef = useRef(false);

  function updateScrollToBottomVisibility(element: HTMLDivElement | null) {
    const nextVisible = shouldShowScrollToBottom(element);
    if (showScrollToBottomRef.current === nextVisible) return;
    showScrollToBottomRef.current = nextVisible;
    setShowScrollToBottom(nextVisible);
  }

  useLayoutEffect(() => {
    if (!welcomeOnboardingPageShouldOpenAtTop(welcomeOnboardingPageKind)) return;
    const element = scrollRef.current;
    if (!element) return;
    shouldTailMessagesRef.current = false;
    programmaticMessagesScrollRef.current = true;
    element.scrollTop = 0;
    updateScrollToBottomVisibility(element);
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
    if (!shouldTailMessagesRef.current) return;
    const element = scrollRef.current;
    if (!element) return;
    programmaticMessagesScrollRef.current = true;
    const cancel = scheduleScrollToBottom(element, () => {
      programmaticMessagesScrollRef.current = false;
      shouldTailMessagesRef.current = isScrolledToBottom(element, RUN_ACTIVITY_SCROLL_THRESHOLD);
      updateScrollToBottomVisibility(element);
    });
    return () => {
      cancel();
      programmaticMessagesScrollRef.current = false;
    };
  }, [messages, activeRunActivityLines, chatBrowserUserActionId, chatBrowserUserActionStatus, welcomeOnboardingPageKind]);

  useLayoutEffect(() => {
    updateScrollToBottomVisibility(scrollRef.current);
  }, [messages, activeRunActivityLines, chatBrowserUserActionId, chatBrowserUserActionStatus]);

  function handleMessagesScroll() {
    const element = scrollRef.current;
    updateScrollToBottomVisibility(element);
    if (programmaticMessagesScrollRef.current) return;
    shouldTailMessagesRef.current = isScrolledToBottom(element, RUN_ACTIVITY_SCROLL_THRESHOLD);
  }

  function jumpToLatestMessage() {
    const element = scrollRef.current;
    if (!element) return;
    shouldTailMessagesRef.current = true;
    programmaticMessagesScrollRef.current = true;
    const cancel = scheduleScrollToBottom(element, () => {
      programmaticMessagesScrollRef.current = false;
      shouldTailMessagesRef.current = true;
      updateScrollToBottomVisibility(element);
    });
    window.setTimeout(cancel, 500);
  }

  function requestMessageTail(threadId = activeThreadIdRef.current) {
    if (!shouldRequestMessageTail(threadId, activeThreadIdRef.current)) return;
    shouldTailMessagesRef.current = true;
    const element = scrollRef.current;
    if (!element) return;
    programmaticMessagesScrollRef.current = true;
    const cancel = scheduleScrollToBottom(element, () => {
      programmaticMessagesScrollRef.current = false;
      shouldTailMessagesRef.current = true;
      updateScrollToBottomVisibility(element);
    });
    window.setTimeout(cancel, 500);
  }

  return {
    handleMessagesScroll,
    jumpToLatestMessage,
    requestMessageTail,
    scrollRef,
    showScrollToBottom,
  };
}
