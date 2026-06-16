import type { MouseEvent as ReactMouseEvent } from "react";

import { clampSidebarWidth, SIDEBAR_WIDTH_STORAGE_KEY } from "./sidebarLayout";

type WidthSetter = (width: number) => void;
type ResizeStartEvent = Pick<ReactMouseEvent<HTMLDivElement>, "preventDefault" | "nativeEvent">;
type ElementResizeStartEvent = ResizeStartEvent & Pick<ReactMouseEvent<HTMLDivElement>, "currentTarget">;

export const WORKFLOW_RECORDER_REVIEW_MIN_WIDTH = 360;
export const WORKFLOW_RECORDER_REVIEW_MAX_WIDTH = 680;
export const WORKFLOW_RECORDER_REVIEW_MIN_CONVERSATION_WIDTH = 420;

export function rightPanelWidthFromPointer(pointerClientX: number, viewportWidth: number): number {
  return Math.max(360, Math.min(Math.max(360, viewportWidth - 1), viewportWidth - pointerClientX));
}

export function workflowRecorderReviewWidthFromPointer(
  pointerClientX: number,
  rect: Pick<DOMRect, "left" | "right" | "width">,
): number {
  const maxByContainer = Math.max(
    WORKFLOW_RECORDER_REVIEW_MIN_WIDTH,
    Math.min(
      WORKFLOW_RECORDER_REVIEW_MAX_WIDTH,
      Math.round(rect.width - WORKFLOW_RECORDER_REVIEW_MIN_CONVERSATION_WIDTH),
    ),
  );
  const rawWidth = Math.round(rect.right - pointerClientX);
  return Math.max(WORKFLOW_RECORDER_REVIEW_MIN_WIDTH, Math.min(maxByContainer, rawWidth));
}

export function beginAppSidebarResize(event: ResizeStartEvent, setSidebarWidth: WidthSetter) {
  event.preventDefault();
  const applyWidth = (clientX: number) => {
    const width = clampSidebarWidth(clientX, window.innerWidth);
    setSidebarWidth(width);
    try {
      window.localStorage.setItem(SIDEBAR_WIDTH_STORAGE_KEY, String(width));
    } catch {
      // Sidebar width persistence is best-effort.
    }
  };
  const scheduler = createResizeFrameScheduler(applyWidth);
  const move = (moveEvent: MouseEvent) => scheduler.schedule(moveEvent.clientX);
  const stop = () => {
    scheduler.flush();
    document.body.classList.remove("resizing-sidebar");
    window.removeEventListener("mousemove", move);
    window.removeEventListener("mouseup", stop);
  };
  document.body.classList.add("resizing-sidebar");
  window.addEventListener("mousemove", move);
  window.addEventListener("mouseup", stop);
  applyWidth(event.nativeEvent.clientX);
}

export function beginAppRightPanelResize(event: ResizeStartEvent, setRightPanelWidth: WidthSetter) {
  event.preventDefault();
  const applyWidth = (clientX: number) => setRightPanelWidth(rightPanelWidthFromPointer(clientX, window.innerWidth));
  const scheduler = createResizeFrameScheduler(applyWidth);
  const move = (moveEvent: MouseEvent) => scheduler.schedule(moveEvent.clientX);
  const stop = () => {
    scheduler.flush();
    document.body.classList.remove("resizing-right-panel");
    window.removeEventListener("mousemove", move);
    window.removeEventListener("mouseup", stop);
  };
  document.body.classList.add("resizing-right-panel");
  window.addEventListener("mousemove", move);
  window.addEventListener("mouseup", stop);
  applyWidth(event.nativeEvent.clientX);
}

export function beginAppWorkflowRecorderReviewResize(event: ElementResizeStartEvent, setReviewPanelWidth: WidthSetter) {
  event.preventDefault();
  const container = event.currentTarget.parentElement;
  if (!container) return;
  const rect = container.getBoundingClientRect();
  const applyWidth = (clientX: number) => setReviewPanelWidth(workflowRecorderReviewWidthFromPointer(clientX, rect));
  const scheduler = createResizeFrameScheduler(applyWidth);
  const move = (moveEvent: MouseEvent) => scheduler.schedule(moveEvent.clientX);
  const stop = () => {
    scheduler.flush();
    document.body.classList.remove("resizing-workflow-recorder-review");
    window.removeEventListener("mousemove", move);
    window.removeEventListener("mouseup", stop);
  };
  document.body.classList.add("resizing-workflow-recorder-review");
  window.addEventListener("mousemove", move);
  window.addEventListener("mouseup", stop);
  applyWidth(event.nativeEvent.clientX);
}

function createResizeFrameScheduler(apply: (clientX: number) => void): {
  flush: () => void;
  schedule: (clientX: number) => void;
} {
  let frame: number | ReturnType<typeof globalThis.setTimeout> | undefined;
  let pendingClientX: number | undefined;
  const requestFrame = (callback: () => void) => {
    if (typeof window.requestAnimationFrame === "function") return window.requestAnimationFrame(callback);
    return globalThis.setTimeout(callback, 16);
  };
  const cancelFrame = (handle: number | ReturnType<typeof globalThis.setTimeout>) => {
    if (typeof handle === "number" && typeof window.cancelAnimationFrame === "function") {
      window.cancelAnimationFrame(handle);
      return;
    }
    globalThis.clearTimeout(handle as ReturnType<typeof globalThis.setTimeout>);
  };
  const flush = () => {
    if (frame !== undefined) {
      cancelFrame(frame);
      frame = undefined;
    }
    if (pendingClientX === undefined) return;
    const clientX = pendingClientX;
    pendingClientX = undefined;
    apply(clientX);
  };
  return {
    flush,
    schedule: (clientX: number) => {
      pendingClientX = clientX;
      if (frame !== undefined) return;
      frame = requestFrame(() => {
        frame = undefined;
        flush();
      });
    },
  };
}
