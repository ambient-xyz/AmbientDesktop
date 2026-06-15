import type { MouseEvent as ReactMouseEvent } from "react";

import { clampSidebarWidth, SIDEBAR_WIDTH_STORAGE_KEY } from "./sidebarLayout";

type WidthSetter = (width: number) => void;
type ResizeStartEvent = Pick<ReactMouseEvent<HTMLDivElement>, "preventDefault" | "nativeEvent">;

export function rightPanelWidthFromPointer(pointerClientX: number, viewportWidth: number): number {
  return Math.max(360, Math.min(Math.max(360, viewportWidth - 1), viewportWidth - pointerClientX));
}

export function beginAppSidebarResize(event: ResizeStartEvent, setSidebarWidth: WidthSetter) {
  event.preventDefault();
  const move = (moveEvent: MouseEvent) => {
    const width = clampSidebarWidth(moveEvent.clientX, window.innerWidth);
    setSidebarWidth(width);
    try {
      window.localStorage.setItem(SIDEBAR_WIDTH_STORAGE_KEY, String(width));
    } catch {
      // Sidebar width persistence is best-effort.
    }
  };
  const stop = () => {
    document.body.classList.remove("resizing-sidebar");
    window.removeEventListener("mousemove", move);
    window.removeEventListener("mouseup", stop);
  };
  document.body.classList.add("resizing-sidebar");
  window.addEventListener("mousemove", move);
  window.addEventListener("mouseup", stop);
  move(event.nativeEvent);
}

export function beginAppRightPanelResize(event: ResizeStartEvent, setRightPanelWidth: WidthSetter) {
  event.preventDefault();
  const move = (moveEvent: MouseEvent) => {
    setRightPanelWidth(rightPanelWidthFromPointer(moveEvent.clientX, window.innerWidth));
  };
  const stop = () => {
    document.body.classList.remove("resizing-right-panel");
    window.removeEventListener("mousemove", move);
    window.removeEventListener("mouseup", stop);
  };
  document.body.classList.add("resizing-right-panel");
  window.addEventListener("mousemove", move);
  window.addEventListener("mouseup", stop);
  move(event.nativeEvent);
}
