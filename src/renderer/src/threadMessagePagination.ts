import type { DesktopState, ThreadMessagePage } from "../../shared/desktopTypes";

export const THREAD_MESSAGE_PAGE_LOAD_LIMIT = 100;

export function desktopStateWithPrependedThreadMessages(
  current: DesktopState | undefined,
  page: ThreadMessagePage,
): DesktopState | undefined {
  if (!current || current.activeThreadId !== page.threadId) return current;
  const existingIds = new Set(current.messages.map((message) => message.id));
  const prepended = page.messages.filter((message) => !existingIds.has(message.id));
  if (prepended.length === 0 && current.messageWindow?.hasMoreBefore === page.hasMoreBefore) return current;
  const messages = [...prepended, ...current.messages];
  return {
    ...current,
    messages,
    messageWindow: {
      threadId: page.threadId,
      order: "latest",
      limit: current.messageWindow?.limit ?? page.limit,
      loadedCount: messages.length,
      hasMoreBefore: page.hasMoreBefore,
    },
  };
}
