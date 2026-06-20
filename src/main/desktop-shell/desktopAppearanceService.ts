import { join } from "node:path";
import type {
  AppAppearance,
  DesktopEvent,
  ResolvedTheme,
  ThemePreference,
} from "../../shared/desktopTypes";
import { appearanceBackgroundColor, resolveAppearance } from "./appAppearance";

export interface DesktopAppearanceWindow {
  setBackgroundColor(color: string): void;
  webContents: {
    send(channel: "desktop:event", event: DesktopEvent): void;
  };
}

export interface DesktopAppearanceServiceDependencies {
  appPath(): string;
  cwd(): string;
  dockSetIcon?(iconPath: string): void;
  existsSync(path: string): boolean;
  mainWindow(): DesktopAppearanceWindow | undefined;
  platform(): NodeJS.Platform;
  resourcesPath(): string;
  setNativeThemeSource(preference: ThemePreference): void;
  systemPrefersDark(): boolean;
  userDataPath(): string;
}

export interface DesktopAppearanceService {
  appearancePreferencesPath(): string;
  applyThemePreference(preference: ThemePreference): AppAppearance;
  currentAppearance(): AppAppearance;
  currentBackgroundColor(): string;
  currentResolvedTheme(): ResolvedTheme;
  publishAppearanceUpdated(): void;
  resolveAppIconPath(): string | undefined;
  resolveBuiltOutputPath(...segments: string[]): string;
  setDockIcon(iconPath: string | undefined): void;
}

export function createDesktopAppearanceService(
  dependencies: DesktopAppearanceServiceDependencies,
): DesktopAppearanceService {
  let themePreference: ThemePreference = "system";

  function resolveBuiltOutputPath(...segments: string[]): string {
    return join(dependencies.appPath(), "out", ...segments);
  }

  function resolveAppIconPath(): string | undefined {
    const candidates = [
      join(dependencies.cwd(), "build", "icon.png"),
      join(dependencies.resourcesPath(), "icon.png"),
    ];
    return candidates.find((candidate) => dependencies.existsSync(candidate));
  }

  function appearancePreferencesPath(): string {
    return join(dependencies.userDataPath(), "preferences.json");
  }

  function currentAppearance(): AppAppearance {
    return resolveAppearance(themePreference, dependencies.systemPrefersDark());
  }

  function currentResolvedTheme(): ResolvedTheme {
    return currentAppearance().resolvedTheme;
  }

  function currentBackgroundColor(): string {
    return appearanceBackgroundColor(currentResolvedTheme());
  }

  function applyThemePreference(preference: ThemePreference): AppAppearance {
    themePreference = preference;
    dependencies.setNativeThemeSource(preference);
    return currentAppearance();
  }

  function publishAppearanceUpdated(): void {
    const appearance = currentAppearance();
    const window = dependencies.mainWindow();
    window?.setBackgroundColor(appearanceBackgroundColor(appearance.resolvedTheme));
    window?.webContents.send("desktop:event", { type: "appearance-updated", appearance } satisfies DesktopEvent);
  }

  function setDockIcon(iconPath: string | undefined): void {
    if (dependencies.platform() === "darwin" && iconPath) {
      dependencies.dockSetIcon?.(iconPath);
    }
  }

  return {
    appearancePreferencesPath,
    applyThemePreference,
    currentAppearance,
    currentBackgroundColor,
    currentResolvedTheme,
    publishAppearanceUpdated,
    resolveAppIconPath,
    resolveBuiltOutputPath,
    setDockIcon,
  };
}
