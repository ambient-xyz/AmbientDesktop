import { useCallback, useLayoutEffect, useMemo, useRef, useState, type RefObject } from "react";

export type VirtualMessageLike = {
  id: string;
  role: string;
  content: string;
};

export type VirtualMessageRow<T extends VirtualMessageLike> = {
  item: T;
  index: number;
  start: number;
  size: number;
};

export type VirtualMessageRange<T extends VirtualMessageLike> = {
  rows: VirtualMessageRow<T>[];
  totalHeight: number;
};

const DEFAULT_OVERSCAN_PX = 1_200;
const VIRTUALIZATION_MIN_MESSAGES = 80;
const MIN_ROW_HEIGHT = 96;
const MAX_ESTIMATED_ROW_HEIGHT = 760;
const BOTTOM_ANCHOR_DISTANCE = 160;

export function shouldVirtualizeMessages(input: {
  messageCount: number;
  chatFindOpen: boolean;
  activeSubagentInspector: boolean;
}): boolean {
  return input.messageCount >= VIRTUALIZATION_MIN_MESSAGES && !input.chatFindOpen && !input.activeSubagentInspector;
}

export function estimateMessageRowHeight(message: VirtualMessageLike): number {
  const explicitLines = message.content.split(/\r?\n/).length;
  const wrappedLines = Math.ceil(message.content.length / 92);
  const estimatedTextLines = Math.min(28, Math.max(explicitLines, wrappedLines));
  const roleBase = message.role === "tool" ? 132 : message.role === "user" ? 92 : 124;
  const lineHeight = message.role === "tool" ? 18 : 22;
  return clamp(roleBase + estimatedTextLines * lineHeight, MIN_ROW_HEIGHT, MAX_ESTIMATED_ROW_HEIGHT);
}

export function calculateVirtualMessageRange<T extends VirtualMessageLike>(input: {
  items: readonly T[];
  scrollTop: number;
  viewportHeight: number;
  overscanPx?: number;
  activeIds?: ReadonlySet<string>;
  measuredHeights?: ReadonlyMap<string, number>;
}): VirtualMessageRange<T> {
  const overscanPx = input.overscanPx ?? DEFAULT_OVERSCAN_PX;
  const activeIds = input.activeIds ?? new Set<string>();
  const startBoundary = Math.max(0, input.scrollTop - overscanPx);
  const endBoundary = input.scrollTop + Math.max(0, input.viewportHeight) + overscanPx;
  const starts: number[] = [];
  const sizes: number[] = [];
  let totalHeight = 0;

  for (const item of input.items) {
    starts.push(totalHeight);
    const measured = input.measuredHeights?.get(item.id);
    const size = measured && measured > 0 ? measured : estimateMessageRowHeight(item);
    sizes.push(size);
    totalHeight += size;
  }

  const indexes = new Set<number>();
  for (let index = 0; index < input.items.length; index += 1) {
    const item = input.items[index];
    const start = starts[index] ?? 0;
    const size = sizes[index] ?? MIN_ROW_HEIGHT;
    const end = start + size;
    if (end >= startBoundary && start <= endBoundary) indexes.add(index);
    if (activeIds.has(item.id)) indexes.add(index);
  }

  return {
    totalHeight,
    rows: [...indexes]
      .sort((left, right) => left - right)
      .map((index) => ({
        item: input.items[index]!,
        index,
        start: starts[index] ?? 0,
        size: sizes[index] ?? MIN_ROW_HEIGHT,
      })),
  };
}

export function useVirtualMessageRows<T extends VirtualMessageLike>({
  items,
  scrollRef,
  enabled,
  activeIds,
  overscanPx = DEFAULT_OVERSCAN_PX,
}: {
  items: readonly T[];
  scrollRef: RefObject<HTMLElement | null>;
  enabled: boolean;
  activeIds?: ReadonlySet<string>;
  overscanPx?: number;
}): VirtualMessageRange<T> & {
  enabled: boolean;
  measureElement: (item: T, element: HTMLElement | null) => void;
} {
  const measuredHeightsRef = useRef(new Map<string, number>());
  const resizeObserversRef = useRef(new Map<string, ResizeObserver>());
  const totalHeightRef = useRef(0);
  const [measurementRevision, setMeasurementRevision] = useState(0);
  const [viewport, setViewport] = useState({ scrollTop: 0, viewportHeight: 0 });

  const updateViewport = useCallback(() => {
    const element = scrollRef.current;
    setViewport({
      scrollTop: element?.scrollTop ?? 0,
      viewportHeight: element?.clientHeight ?? 0,
    });
  }, [scrollRef]);

  useLayoutEffect(() => {
    const element = scrollRef.current;
    if (!enabled || !element) {
      updateViewport();
      return;
    }
    let frame: number | undefined;
    const scheduleUpdate = () => {
      if (frame !== undefined) window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => {
        frame = undefined;
        updateViewport();
      });
    };
    const observer = new ResizeObserver(scheduleUpdate);
    observer.observe(element);
    element.addEventListener("scroll", scheduleUpdate, { passive: true });
    scheduleUpdate();
    return () => {
      if (frame !== undefined) window.cancelAnimationFrame(frame);
      observer.disconnect();
      element.removeEventListener("scroll", scheduleUpdate);
    };
  }, [enabled, scrollRef, updateViewport]);

  useLayoutEffect(() => {
    updateViewport();
  }, [items.length, enabled, updateViewport]);

  useLayoutEffect(() => {
    const ids = new Set(items.map((item) => item.id));
    for (const id of measuredHeightsRef.current.keys()) {
      if (!ids.has(id)) measuredHeightsRef.current.delete(id);
    }
    for (const [id, observer] of resizeObserversRef.current.entries()) {
      if (ids.has(id)) continue;
      observer.disconnect();
      resizeObserversRef.current.delete(id);
    }
  }, [items]);

  const range = useMemo(() => {
    if (!enabled) {
      const rows = items.map((item, index) => ({
        item,
        index,
        start: 0,
        size: measuredHeightsRef.current.get(item.id) ?? estimateMessageRowHeight(item),
      }));
      const totalHeight = rows.reduce((sum, row) => sum + row.size, 0);
      totalHeightRef.current = totalHeight;
      return { rows, totalHeight };
    }
    const next = calculateVirtualMessageRange({
      items,
      scrollTop: viewport.scrollTop,
      viewportHeight: viewport.viewportHeight,
      overscanPx,
      activeIds,
      measuredHeights: measuredHeightsRef.current,
    });
    totalHeightRef.current = next.totalHeight;
    return next;
  }, [activeIds, enabled, items, measurementRevision, overscanPx, viewport.scrollTop, viewport.viewportHeight]);

  const measureElement = useCallback(
    (item: T, element: HTMLElement | null) => {
      const existingObserver = resizeObserversRef.current.get(item.id);
      if (existingObserver) {
        existingObserver.disconnect();
        resizeObserversRef.current.delete(item.id);
      }
      if (!element) return;

      const updateHeight = () => {
        const nextHeight = Math.ceil(element.getBoundingClientRect().height);
        if (nextHeight <= 0) return;
        const previousHeight = measuredHeightsRef.current.get(item.id) ?? estimateMessageRowHeight(item);
        if (Math.abs(previousHeight - nextHeight) < 1) return;
        const scrollElement = scrollRef.current;
        const wasNearBottom = scrollElement
          ? totalHeightRef.current - scrollElement.scrollTop - scrollElement.clientHeight <= BOTTOM_ANCHOR_DISTANCE
          : false;
        measuredHeightsRef.current.set(item.id, nextHeight);
        setMeasurementRevision((revision) => revision + 1);
        if (wasNearBottom && scrollElement) {
          window.requestAnimationFrame(() => {
            scrollElement.scrollTop = scrollElement.scrollHeight;
          });
        }
      };

      updateHeight();
      const observer = new ResizeObserver(updateHeight);
      observer.observe(element);
      resizeObserversRef.current.set(item.id, observer);
    },
    [scrollRef],
  );

  return {
    enabled,
    rows: range.rows,
    totalHeight: range.totalHeight,
    measureElement,
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
