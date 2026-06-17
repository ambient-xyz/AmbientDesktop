import { describe, expect, it, vi } from "vitest";
import type { MenuItemConstructorOptions } from "electron";

import { buildAppMenuTemplate, installAppMenu } from "./menu";

const electronMocks = vi.hoisted(() => ({
  buildFromTemplate: vi.fn((template: MenuItemConstructorOptions[]) => ({ template })),
  setApplicationMenu: vi.fn(),
  openExternal: vi.fn(),
}));

vi.mock("electron", () => ({
  Menu: {
    buildFromTemplate: electronMocks.buildFromTemplate,
    setApplicationMenu: electronMocks.setApplicationMenu,
  },
  shell: {
    openExternal: electronMocks.openExternal,
  },
}));

describe("app menu", () => {
  it("puts Check for Updates directly under About in the macOS app menu", () => {
    const onCheckForUpdates = vi.fn();
    const template = buildAppMenuTemplate(() => undefined, { onCheckForUpdates }, "darwin");
    const ambientMenu = findSubmenu(template, "Ambient Desktop");

    expect(ambientMenu[0]).toMatchObject({ role: "about" });
    expect(ambientMenu[1]).toMatchObject({ label: "Check for Updates..." });

    ambientMenu[1]?.click?.({} as never, undefined, {} as never);

    expect(onCheckForUpdates).toHaveBeenCalledOnce();
  });

  it("installs the generated menu template", () => {
    installAppMenu(() => undefined);

    expect(electronMocks.buildFromTemplate).toHaveBeenCalledOnce();
    expect(electronMocks.setApplicationMenu).toHaveBeenCalledOnce();
  });
});

function findSubmenu(template: MenuItemConstructorOptions[], label: string): MenuItemConstructorOptions[] {
  const item = template.find((entry) => entry.label === label);
  if (!item || !Array.isArray(item.submenu)) throw new Error(`Missing ${label} submenu.`);
  return item.submenu;
}
