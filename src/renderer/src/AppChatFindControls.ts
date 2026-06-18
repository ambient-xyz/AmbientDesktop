import { useEffect, useMemo, useRef, useState } from "react";
import type { Dispatch, RefObject, SetStateAction } from "react";

import type { ThinkingDisplayMode } from "../../shared/desktopTypes";
import type { ChatMessage } from "../../shared/threadTypes";
import {
  countTextMatches,
  visibleMessages,
} from "./AppMessages";

export function chatFindMatchCount({
  messages,
  query,
  running,
  thinkingDisplayMode,
}: {
  messages: ChatMessage[];
  query: string;
  running: boolean;
  thinkingDisplayMode: ThinkingDisplayMode;
}): number {
  const needle = query.trim();
  if (!needle) return 0;
  return visibleMessages(messages, running, thinkingDisplayMode).reduce(
    (count, message) => count + countTextMatches(message.content, needle),
    0,
  );
}

export function nextChatFindIndex({
  count,
  current,
  direction,
}: {
  count: number;
  current: number;
  direction: "previous" | "next";
}): number {
  if (count <= 0) return 0;
  return direction === "previous" ? (current + count - 1) % count : (current + 1) % count;
}

export function useAppChatFindControls({
  activeThreadId,
  messages,
  running,
  thinkingDisplayMode,
}: {
  activeThreadId: string | undefined;
  messages: ChatMessage[] | undefined;
  running: boolean;
  thinkingDisplayMode: ThinkingDisplayMode;
}): {
  chatFindOpen: boolean;
  setChatFindOpen: Dispatch<SetStateAction<boolean>>;
  chatFindInputRef: RefObject<HTMLInputElement | null>;
  chatFindQuery: string;
  chatFindCount: number;
  chatFindIndex: number;
  setChatFindQuery: Dispatch<SetStateAction<string>>;
  onChatFindPrevious: () => void;
  onChatFindNext: () => void;
  onChatFindClose: () => void;
} {
  const [chatFindOpen, setChatFindOpen] = useState(false);
  const [chatFindQuery, setChatFindQuery] = useState("");
  const [chatFindIndex, setChatFindIndex] = useState(0);
  const chatFindInputRef = useRef<HTMLInputElement>(null);
  const chatFindCount = useMemo(
    () =>
      chatFindMatchCount({
        messages: messages ?? [],
        query: chatFindQuery,
        running,
        thinkingDisplayMode,
      }),
    [chatFindQuery, messages, running, thinkingDisplayMode],
  );

  useEffect(() => {
    setChatFindIndex(0);
  }, [chatFindQuery, activeThreadId]);

  useEffect(() => {
    if (!chatFindOpen || !chatFindQuery.trim()) return;
    const marks = [...document.querySelectorAll<HTMLElement>(".chat-find-highlight")];
    marks.forEach((mark) => mark.classList.remove("active"));
    if (marks.length === 0) return;
    const bounded = Math.min(chatFindIndex, marks.length - 1);
    const mark = marks[bounded];
    mark.classList.add("active");
    mark.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [chatFindOpen, chatFindQuery, chatFindIndex, messages]);

  return {
    chatFindOpen,
    setChatFindOpen,
    chatFindInputRef,
    chatFindQuery,
    chatFindCount,
    chatFindIndex,
    setChatFindQuery,
    onChatFindPrevious() {
      setChatFindIndex((index) => nextChatFindIndex({ count: chatFindCount, current: index, direction: "previous" }));
    },
    onChatFindNext() {
      setChatFindIndex((index) => nextChatFindIndex({ count: chatFindCount, current: index, direction: "next" }));
    },
    onChatFindClose() {
      setChatFindOpen(false);
      setChatFindQuery("");
    },
  };
}
