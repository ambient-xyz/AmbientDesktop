import { describe, expect, it } from "vitest";
import { centerBoundsInWorkArea, hasMeaningfulVisibleArea, parsePersistedWindowState } from "./windowState";

const version = "0.1.2";
const primary = { x: 0, y: 0, width: 1440, height: 900 };
const external = { x: 1440, y: 0, width: 2560, height: 1440 };

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
