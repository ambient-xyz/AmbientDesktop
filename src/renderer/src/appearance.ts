import type { AppAppearance, ResolvedTheme } from "../../shared/desktopTypes";

const resolvedThemeStorageKey = "ambient-desktop-resolved-theme";

function isResolvedTheme(value: unknown): value is ResolvedTheme {
  return value === "light" || value === "dark";
}

function setDocumentTheme(resolvedTheme: ResolvedTheme, themePreference?: string): void {
  document.documentElement.dataset.theme = resolvedTheme;
  if (themePreference) document.documentElement.dataset.themePreference = themePreference;
  document.documentElement.style.colorScheme = resolvedTheme;
}

export function applyStoredAppearanceHint(): void {
  try {
    const storedTheme = window.localStorage.getItem(resolvedThemeStorageKey);
    if (isResolvedTheme(storedTheme)) setDocumentTheme(storedTheme);
  } catch {
    // Theme hints are best-effort; the main-process preference is authoritative.
  }
}

export function applyDocumentAppearance(appearance: AppAppearance): void {
  setDocumentTheme(appearance.resolvedTheme, appearance.themePreference);
  try {
    window.localStorage.setItem(resolvedThemeStorageKey, appearance.resolvedTheme);
  } catch {
    // Ignore unavailable storage in hardened or test environments.
  }
}
