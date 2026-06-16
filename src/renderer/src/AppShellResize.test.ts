import { afterEach, describe, expect, it, vi } from "vitest";

import {
  beginAppRightPanelResize,
  beginAppSidebarResize,
  beginAppWorkflowRecorderReviewResize,
  workflowRecorderReviewWidthFromPointer,
  rightPanelWidthFromPointer,
} from "./AppShellResize";
import { SIDEBAR_WIDTH_STORAGE_KEY } from "./sidebarLayout";

const previousWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
const previousDocument = Object.getOwnPropertyDescriptor(globalThis, "document");

afterEach(() => {
  if (previousWindow) {
    Object.defineProperty(globalThis, "window", previousWindow);
  } else {
    delete (globalThis as { window?: unknown }).window;
  }
  if (previousDocument) {
    Object.defineProperty(globalThis, "document", previousDocument);
  } else {
    delete (globalThis as { document?: unknown }).document;
  }
});

describe("AppShellResize", () => {
  it("clamps right panel width from the pointer position", () => {
    expect(rightPanelWidthFromPointer(500, 1200)).toBe(700);
    expect(rightPanelWidthFromPointer(1000, 1200)).toBe(360);
    expect(rightPanelWidthFromPointer(-100, 1200)).toBe(1199);
  });

  it("clamps workflow recorder review width while preserving conversation space", () => {
    const rect = { left: 0, right: 1200, width: 1200 } as DOMRect;
    expect(workflowRecorderReviewWidthFromPointer(780, rect)).toBe(420);
    expect(workflowRecorderReviewWidthFromPointer(1000, rect)).toBe(360);
    expect(workflowRecorderReviewWidthFromPointer(200, rect)).toBe(680);
    expect(workflowRecorderReviewWidthFromPointer(100, { left: 0, right: 760, width: 760 } as DOMRect)).toBe(360);
  });

  it("starts sidebar resize with the existing class, listeners, and persisted width", () => {
    const setSidebarWidth = vi.fn();
    const localStorageSetItem = vi.fn();
    const windowStub = stubWindow({
      innerWidth: 1200,
      localStorage: { setItem: localStorageSetItem },
    });
    const bodyClassList = stubDocument();
    const event = resizeStartEvent(333.6);

    beginAppSidebarResize(event, setSidebarWidth);

    expect(event.preventDefault).toHaveBeenCalled();
    expect(bodyClassList.add).toHaveBeenCalledWith("resizing-sidebar");
    expect(windowStub.addEventListener).toHaveBeenCalledWith("mousemove", expect.any(Function));
    expect(windowStub.addEventListener).toHaveBeenCalledWith("mouseup", expect.any(Function));
    expect(setSidebarWidth).toHaveBeenCalledWith(334);
    expect(localStorageSetItem).toHaveBeenCalledWith(SIDEBAR_WIDTH_STORAGE_KEY, "334");
  });

  it("starts right-panel resize with the existing class and width clamp", () => {
    const setRightPanelWidth = vi.fn();
    const windowStub = stubWindow({
      innerWidth: 1200,
      localStorage: { setItem: vi.fn() },
    });
    const bodyClassList = stubDocument();
    const event = resizeStartEvent(900);

    beginAppRightPanelResize(event, setRightPanelWidth);

    expect(event.preventDefault).toHaveBeenCalled();
    expect(bodyClassList.add).toHaveBeenCalledWith("resizing-right-panel");
    expect(windowStub.addEventListener).toHaveBeenCalledWith("mousemove", expect.any(Function));
    expect(windowStub.addEventListener).toHaveBeenCalledWith("mouseup", expect.any(Function));
    expect(setRightPanelWidth).toHaveBeenCalledWith(360);
  });

  it("starts workflow recorder review resize from the split container bounds", () => {
    const setReviewPanelWidth = vi.fn();
    const windowStub = stubWindow({
      innerWidth: 1200,
      localStorage: { setItem: vi.fn() },
    });
    const bodyClassList = stubDocument();
    const event = resizeStartEvent(760, {
      getBoundingClientRect: () => ({ left: 100, right: 1100, width: 1000 }),
    });

    beginAppWorkflowRecorderReviewResize(event, setReviewPanelWidth);

    expect(event.preventDefault).toHaveBeenCalled();
    expect(bodyClassList.add).toHaveBeenCalledWith("resizing-workflow-recorder-review");
    expect(windowStub.addEventListener).toHaveBeenCalledWith("mousemove", expect.any(Function));
    expect(windowStub.addEventListener).toHaveBeenCalledWith("mouseup", expect.any(Function));
    expect(setReviewPanelWidth).toHaveBeenCalledWith(360);
  });
});

function resizeStartEvent(clientX: number, parentElement?: { getBoundingClientRect: () => Pick<DOMRect, "left" | "right" | "width"> }) {
  return {
    preventDefault: vi.fn(),
    nativeEvent: { clientX } as MouseEvent,
    currentTarget: { parentElement } as HTMLDivElement,
  };
}

function stubWindow(windowValue: {
  innerWidth: number;
  localStorage: { setItem: (key: string, value: string) => void };
}) {
  const value = {
    ...windowValue,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  };
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value,
  });
  return value;
}

function stubDocument() {
  const classList = {
    add: vi.fn(),
    remove: vi.fn(),
  };
  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: {
      body: { classList },
    },
  });
  return classList;
}
