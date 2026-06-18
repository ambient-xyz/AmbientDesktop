import type { Rectangle } from "electron";

export const MIN_WINDOW_WIDTH = 980;
export const MIN_WINDOW_HEIGHT = 680;

export interface PersistedWindowState extends Partial<Rectangle> {
  appVersion?: string;
  maximized?: boolean;
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
