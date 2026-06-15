export type ScrollableElement = Pick<HTMLElement, "clientHeight" | "scrollHeight" | "scrollTo" | "scrollTop">;

export const SHOW_SCROLL_TO_BOTTOM_DISTANCE = 180;

export function isScrolledToBottom(element: Pick<HTMLElement, "clientHeight" | "scrollHeight" | "scrollTop"> | null, threshold = 16): boolean {
  if (!element) return true;
  return element.scrollHeight - element.scrollTop - element.clientHeight <= threshold;
}

export function scrollToBottom(element: ScrollableElement | null): void {
  element?.scrollTo({ top: element.scrollHeight });
}
