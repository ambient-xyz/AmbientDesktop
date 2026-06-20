import type { Rectangle } from "electron";
import { describe, expect, it, vi } from "vitest";
import {
  centerBoundsInWorkArea,
  createWindowStateService,
  hasMeaningfulVisibleArea,
  parsePersistedWindowState,
  windowStatePath,
  type WindowStateServiceWindow,
} from "./windowState";

const version = "0.1.2";
const primary = { x: 0, y: 0, width: 1440, height: 900 };
const external = { x: 1440, y: 0, width: 2560, height: 1440 };
type WindowEvent = "resize" | "move" | "maximize" | "unmaximize" | "close";

function flushAsyncWork(): Promise<void> {
  return Promise.resolve().then(() => undefined);
}

function createWindow(input: {
  bounds?: Rectangle;
  destroyed?: boolean;
  maximized?: boolean;
  normalBounds?: Rectangle;
} = {}): WindowStateServiceWindow & {
  listeners: Partial<Record<WindowEvent, () => void>>;
  setBounds: ReturnType<typeof vi.fn<(bounds: Rectangle) => void>>;
} {
  const listeners: Partial<Record<WindowEvent, () => void>> = {};
  const window = {
    bounds: input.bounds ?? { x: 100, y: 100, width: 1320, height: 900 },
    destroyed: input.destroyed ?? false,
    maximized: input.maximized ?? false,
    normalBounds: input.normalBounds ?? { x: 120, y: 140, width: 1400, height: 920 },
    listeners,
    getBounds() {
      return this.bounds;
    },
    getNormalBounds() {
      return this.normalBounds;
    },
    isDestroyed() {
      return this.destroyed;
    },
    isMaximized() {
      return this.maximized;
    },
    on(event: WindowEvent, listener: () => void) {
      listeners[event] = listener;
    },
    setBounds: vi.fn((bounds: Rectangle) => {
      window.bounds = bounds;
    }),
  };
  return window;
}

describe("window state restore", () => {
  it("drops pre-versioned installer state so a new build starts centered", () => {
    expect(
      parsePersistedWindowState({ x: 2645, y: 96, width: 2442, height: 1309, maximized: false }, version, [primary, external]),
    ).toBeUndefined();
  });

  it("drops window state from an older app version", () => {
    expect(
      parsePersistedWindowState({ appVersion: "0.1.0", x: 100, y: 100, width: 1320, height: 900 }, version, [primary]),
    ).toBeUndefined();
  });

  it("keeps a same-version window that is meaningfully visible on any display", () => {
    expect(parsePersistedWindowState({ appVersion: version, x: 2200, y: 120, width: 1320, height: 900 }, version, [primary, external])).toEqual({
      appVersion: version,
      x: 2200,
      y: 120,
      width: 1320,
      height: 900,
      maximized: false,
    });
  });

  it("rejects a same-version window with only a sliver visible", () => {
    expect(parsePersistedWindowState({ appVersion: version, x: 1380, y: 120, width: 1320, height: 900 }, version, [primary])).toBeUndefined();
  });

  it("centers oversized windows inside the primary work area", () => {
    expect(centerBoundsInWorkArea({ width: 2442, height: 1309 }, primary)).toEqual({ x: 0, y: 0, width: 1440, height: 900 });
  });

  it("requires enough visible area to be recoverable by the user", () => {
    expect(hasMeaningfulVisibleArea({ x: 1000, y: 100, width: 1320, height: 900 }, [primary])).toBe(false);
    expect(hasMeaningfulVisibleArea({ x: 500, y: 100, width: 1320, height: 900 }, [primary])).toBe(true);
  });
});

describe("createWindowStateService", () => {
  it("reads and parses persisted state from the user-data window-state file", async () => {
    const readFile = vi.fn(async () => JSON.stringify({
      appVersion: version,
      x: 220,
      y: 140,
      width: 1320,
      height: 900,
      maximized: true,
    }));
    const service = createWindowStateService({
      appVersion: () => version,
      userDataPath: () => "/user-data",
      displayWorkAreas: () => [primary],
      primaryDisplayWorkArea: () => primary,
      readFile,
      writeFile: vi.fn(async () => undefined),
      setTimeout: vi.fn(),
      clearTimeout: vi.fn(),
      warn: vi.fn(),
    });

    await expect(service.readWindowState()).resolves.toEqual({
      appVersion: version,
      x: 220,
      y: 140,
      width: 1320,
      height: 900,
      maximized: true,
    });
    expect(readFile).toHaveBeenCalledWith(windowStatePath("/user-data"), "utf8");
  });

  it("registers window listeners and debounces state writes", async () => {
    const scheduled = new Map<ReturnType<typeof setTimeout>, () => void>();
    const clearTimeout = vi.fn((handle: ReturnType<typeof setTimeout>) => {
      scheduled.delete(handle);
    });
    const setTimeout = vi.fn((callback: () => void) => {
      const handle = { id: scheduled.size + 1 } as unknown as ReturnType<typeof globalThis.setTimeout>;
      scheduled.set(handle, callback);
      return handle;
    });
    const writeFile = vi.fn(async () => undefined);
    const window = createWindow({ maximized: true });
    const service = createWindowStateService({
      appVersion: () => version,
      userDataPath: () => "/user-data",
      displayWorkAreas: () => [primary],
      primaryDisplayWorkArea: () => primary,
      readFile: vi.fn(async () => "{}"),
      writeFile,
      setTimeout,
      clearTimeout,
      warn: vi.fn(),
    });

    service.trackWindowState(window);
    expect(Object.keys(window.listeners).sort()).toEqual(["close", "maximize", "move", "resize", "unmaximize"]);

    window.listeners.resize?.();
    window.listeners.move?.();
    expect(setTimeout).toHaveBeenCalledTimes(2);
    expect(clearTimeout).toHaveBeenCalledTimes(1);
    scheduled.forEach((callback) => callback());
    await flushAsyncWork();

    expect(writeFile).toHaveBeenCalledWith(
      windowStatePath("/user-data"),
      JSON.stringify({ ...window.getNormalBounds(), maximized: true, appVersion: version }, null, 2),
    );
  });

  it("writes state immediately when the window closes", async () => {
    const writeFile = vi.fn(async () => undefined);
    const window = createWindow();
    const service = createWindowStateService({
      appVersion: () => version,
      userDataPath: () => "/user-data",
      displayWorkAreas: () => [primary],
      primaryDisplayWorkArea: () => primary,
      readFile: vi.fn(async () => "{}"),
      writeFile,
      setTimeout: vi.fn(),
      clearTimeout: vi.fn(),
      warn: vi.fn(),
    });

    service.trackWindowState(window);
    window.listeners.close?.();
    await flushAsyncWork();

    expect(writeFile).toHaveBeenCalledTimes(1);
  });

  it("centers offscreen windows in the primary display work area", () => {
    const window = createWindow({ bounds: { x: 2200, y: 100, width: 1320, height: 900 } });
    const service = createWindowStateService({
      appVersion: () => version,
      userDataPath: () => "/user-data",
      displayWorkAreas: () => [primary],
      primaryDisplayWorkArea: () => primary,
      readFile: vi.fn(async () => "{}"),
      writeFile: vi.fn(async () => undefined),
      setTimeout: vi.fn(),
      clearTimeout: vi.fn(),
      warn: vi.fn(),
    });

    service.ensureWindowVisible(window);

    expect(window.setBounds).toHaveBeenCalledWith({ x: 60, y: 0, width: 1320, height: 900 });
  });
});
