export const SIDEBAR_WIDTH_STORAGE_KEY = "ambient:sidebar-width";
export const DEFAULT_SIDEBAR_WIDTH = 286;
export const MIN_SIDEBAR_WIDTH = 240;
export const MAX_SIDEBAR_WIDTH = 520;
const MIN_MAIN_CONTENT_WIDTH = 240;

export function maxSidebarWidth(viewportWidth: number): number {
  if (!Number.isFinite(viewportWidth) || viewportWidth <= 0) return MAX_SIDEBAR_WIDTH;
  return Math.max(MIN_SIDEBAR_WIDTH, Math.min(MAX_SIDEBAR_WIDTH, viewportWidth - MIN_MAIN_CONTENT_WIDTH));
}

export function clampSidebarWidth(width: number, viewportWidth: number): number {
  if (!Number.isFinite(width)) return DEFAULT_SIDEBAR_WIDTH;
  return Math.max(MIN_SIDEBAR_WIDTH, Math.min(maxSidebarWidth(viewportWidth), Math.round(width)));
}

export function parseStoredSidebarWidth(value: string | null, viewportWidth: number): number {
  if (!value) return DEFAULT_SIDEBAR_WIDTH;
  return clampSidebarWidth(Number(value), viewportWidth);
}

export function readInitialSidebarWidth(): number {
  try {
    return parseStoredSidebarWidth(window.localStorage.getItem(SIDEBAR_WIDTH_STORAGE_KEY), window.innerWidth);
  } catch {
    return DEFAULT_SIDEBAR_WIDTH;
  }
}
