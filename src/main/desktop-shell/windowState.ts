import { readFile as readNodeFile, writeFile as writeNodeFile } from "node:fs/promises";
import { join } from "node:path";
import type { Rectangle } from "electron";

export const MIN_WINDOW_WIDTH = 980;
export const MIN_WINDOW_HEIGHT = 680;

export interface PersistedWindowState extends Partial<Rectangle> {
  appVersion?: string;
  maximized?: boolean;
}

export interface WindowStateServiceWindow {
  getBounds(): Rectangle;
  getNormalBounds(): Rectangle;
  isDestroyed(): boolean;
  isMaximized(): boolean;
  on(event: "resize" | "move" | "maximize" | "unmaximize" | "close", listener: () => void): void;
  setBounds(bounds: Rectangle): void;
}

export interface WindowStateServiceDependencies {
  appVersion(): string;
  userDataPath(): string;
  displayWorkAreas(): Rectangle[];
  primaryDisplayWorkArea(): Rectangle;
  readFile?(path: string, encoding: "utf8"): Promise<string>;
  writeFile?(path: string, content: string): Promise<void>;
  setTimeout(callback: () => void, delayMs: number): ReturnType<typeof setTimeout>;
  clearTimeout(timeout: ReturnType<typeof setTimeout>): void;
  warn(message: string): void;
  saveDelayMs?: number;
}

export interface WindowStateService<Window extends WindowStateServiceWindow = WindowStateServiceWindow> {
  ensureWindowVisible(window: Window): void;
  readWindowState(): Promise<PersistedWindowState | undefined>;
  trackWindowState(window: Window): void;
}

export function createWindowStateService<Window extends WindowStateServiceWindow>({
  appVersion,
  userDataPath,
  displayWorkAreas,
  primaryDisplayWorkArea,
  readFile: readStateFile = (path, encoding) => readNodeFile(path, encoding),
  writeFile: writeStateFile = (path, content) => writeNodeFile(path, content),
  setTimeout,
  clearTimeout,
  warn,
  saveDelayMs = 350,
}: WindowStateServiceDependencies): WindowStateService<Window> {
  let saveTimer: ReturnType<typeof setTimeout> | undefined;

  function statePath(): string {
    return windowStatePath(userDataPath());
  }

  async function readWindowState(): Promise<PersistedWindowState | undefined> {
    try {
      const parsed = JSON.parse(await readStateFile(statePath(), "utf8")) as Record<string, unknown>;
      return parsePersistedWindowState(parsed, appVersion(), displayWorkAreas());
    } catch {
      return undefined;
    }
  }

  function trackWindowState(window: Window): void {
    const scheduleSave = () => scheduleWindowStateSave(window);
    window.on("resize", scheduleSave);
    window.on("move", scheduleSave);
    window.on("maximize", scheduleSave);
    window.on("unmaximize", scheduleSave);
    window.on("close", () => void writeWindowState(window));
  }

  function scheduleWindowStateSave(window: Window): void {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => void writeWindowState(window), saveDelayMs);
  }

  async function writeWindowState(window: Window): Promise<void> {
    if (window.isDestroyed()) return;
    const bounds = window.getNormalBounds();
    try {
      await writeStateFile(statePath(), JSON.stringify({ ...bounds, maximized: window.isMaximized(), appVersion: appVersion() }, null, 2));
    } catch (error) {
      warn(`Unable to save window state: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  function ensureWindowVisible(window: Window): void {
    const bounds = window.getBounds();
    const isVisible = parsePersistedWindowState({ ...bounds, appVersion: appVersion() }, appVersion(), displayWorkAreas());
    if (isVisible?.x !== undefined && isVisible.y !== undefined) return;
    window.setBounds(centerBoundsInWorkArea(bounds, primaryDisplayWorkArea()));
  }

  return {
    ensureWindowVisible,
    readWindowState,
    trackWindowState,
  };
}

export function windowStatePath(userDataPath: string): string {
  return join(userDataPath, "window-state.json");
}

export function parsePersistedWindowState(
  value: Record<string, unknown>,
  appVersion: string,
  displayWorkAreas: Rectangle[],
): PersistedWindowState | undefined {
  if (value.appVersion !== appVersion) return undefined;

  const x = numberFromUnknown(value.x);
  const y = numberFromUnknown(value.y);
  const width = numberFromUnknown(value.width);
  const height = numberFromUnknown(value.height);
  if (width === undefined || height === undefined) return undefined;
  if (width < MIN_WINDOW_WIDTH || height < MIN_WINDOW_HEIGHT) return undefined;
  if (x === undefined || y === undefined) return { width, height, maximized: value.maximized === true, appVersion };

  const bounds = { x, y, width, height };
  if (!hasMeaningfulVisibleArea(bounds, displayWorkAreas)) return undefined;
  return { ...bounds, maximized: value.maximized === true, appVersion };
}

export function centerBoundsInWorkArea(bounds: Pick<Rectangle, "width" | "height">, workArea: Rectangle): Rectangle {
  const width = Math.min(Math.max(Math.round(bounds.width), MIN_WINDOW_WIDTH), workArea.width);
  const height = Math.min(Math.max(Math.round(bounds.height), MIN_WINDOW_HEIGHT), workArea.height);
  return {
    x: workArea.x + Math.round((workArea.width - width) / 2),
    y: workArea.y + Math.round((workArea.height - height) / 2),
    width,
    height,
  };
}

export function hasMeaningfulVisibleArea(bounds: Rectangle, displayWorkAreas: Rectangle[]): boolean {
  const requiredWidth = Math.min(480, Math.round(bounds.width * 0.4));
  const requiredHeight = Math.min(320, Math.round(bounds.height * 0.4));
  return displayWorkAreas.some((area) => {
    const visibleWidth = Math.max(0, Math.min(bounds.x + bounds.width, area.x + area.width) - Math.max(bounds.x, area.x));
    const visibleHeight = Math.max(0, Math.min(bounds.y + bounds.height, area.y + area.height) - Math.max(bounds.y, area.y));
    return visibleWidth >= requiredWidth && visibleHeight >= requiredHeight;
  });
}

function numberFromUnknown(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? Math.round(value) : undefined;
}
