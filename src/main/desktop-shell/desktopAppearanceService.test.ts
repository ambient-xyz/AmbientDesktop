import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import type { DesktopEvent, ThemePreference } from "../../shared/desktopTypes";
import {
  createDesktopAppearanceService,
  type DesktopAppearanceServiceDependencies,
  type DesktopAppearanceWindow,
} from "./desktopAppearanceService";

function createFakeWindow() {
  const events: Array<{ channel: "desktop:event"; event: DesktopEvent }> = [];
  const window: DesktopAppearanceWindow = {
    setBackgroundColor: vi.fn<(color: string) => void>(),
    webContents: {
      send: vi.fn((channel: "desktop:event", event: DesktopEvent) => {
        events.push({ channel, event });
      }),
    },
  };
  return { events, window };
}

function createService(overrides: Partial<DesktopAppearanceServiceDependencies> = {}) {
  const nativeThemeSources: ThemePreference[] = [];
  const dockIcons: string[] = [];
  const dependencies: DesktopAppearanceServiceDependencies = {
    appPath: () => "/app",
    cwd: () => "/cwd",
    dockSetIcon: (iconPath) => dockIcons.push(iconPath),
    existsSync: () => false,
    mainWindow: () => undefined,
    platform: () => "linux",
    resourcesPath: () => "/resources",
    setNativeThemeSource: (preference) => nativeThemeSources.push(preference),
    systemPrefersDark: () => false,
    userDataPath: () => "/user-data",
    ...overrides,
  };
  return {
    dockIcons,
    nativeThemeSources,
    service: createDesktopAppearanceService(dependencies),
  };
}

describe("desktop appearance service", () => {
  it("resolves built output, icon, and preference paths from desktop dependencies", () => {
    const cwdIconPath = join("/cwd", "build", "icon.png");
    const resourcesIconPath = join("/resources", "icon.png");
    const firstCandidate = createService({
      existsSync: (path) => path === cwdIconPath || path === resourcesIconPath,
    });

    expect(firstCandidate.service.resolveBuiltOutputPath("renderer", "index.html")).toBe(
      join("/app", "out", "renderer", "index.html"),
    );
    expect(firstCandidate.service.appearancePreferencesPath()).toBe(join("/user-data", "preferences.json"));
    expect(firstCandidate.service.resolveAppIconPath()).toBe(cwdIconPath);

    const resourcesCandidate = createService({
      existsSync: (path) => path === resourcesIconPath,
    });

    expect(resourcesCandidate.service.resolveAppIconPath()).toBe(resourcesIconPath);
  });

  it("applies explicit theme preferences and publishes the appearance event", () => {
    const { events, window } = createFakeWindow();
    const { nativeThemeSources, service } = createService({
      mainWindow: () => window,
    });

    expect(service.currentAppearance()).toEqual({ themePreference: "system", resolvedTheme: "light" });
    expect(service.applyThemePreference("dark")).toEqual({ themePreference: "dark", resolvedTheme: "dark" });
    expect(nativeThemeSources).toEqual(["dark"]);

    service.publishAppearanceUpdated();

    expect(window.setBackgroundColor).toHaveBeenCalledWith("#0f1418");
    expect(events).toEqual([
      {
        channel: "desktop:event",
        event: {
          type: "appearance-updated",
          appearance: { themePreference: "dark", resolvedTheme: "dark" },
        },
      },
    ]);
  });

  it("keeps system theme resolution live while the preference is system", () => {
    let systemPrefersDark = true;
    const { service } = createService({
      systemPrefersDark: () => systemPrefersDark,
    });

    expect(service.currentResolvedTheme()).toBe("dark");
    expect(service.currentBackgroundColor()).toBe("#0f1418");

    systemPrefersDark = false;

    expect(service.currentResolvedTheme()).toBe("light");
    expect(service.currentBackgroundColor()).toBe("#ffffff");
  });

  it("sets the dock icon only for macOS with a resolved icon path", () => {
    const darwin = createService({
      platform: () => "darwin",
    });
    const linux = createService({
      platform: () => "linux",
    });

    darwin.service.setDockIcon(undefined);
    darwin.service.setDockIcon("/icon.png");
    linux.service.setDockIcon("/icon.png");

    expect(darwin.dockIcons).toEqual(["/icon.png"]);
    expect(linux.dockIcons).toEqual([]);
  });
});
