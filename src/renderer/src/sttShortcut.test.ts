import { describe, expect, it } from "vitest";
import {
  shouldSuppressSttShortcutEventTarget,
  shortcutFromKeyboardEvent,
  sttShortcutLabel,
  sttShortcutMatchesEvent,
  sttShortcutReleaseMatchesEvent,
} from "./sttShortcut";

describe("STT shortcut helpers", () => {
  it("captures cross-platform modifier shortcuts in canonical order", () => {
    expect(shortcutFromKeyboardEvent({
      key: " ",
      code: "Space",
      ctrlKey: true,
      shiftKey: true,
    })).toBe("CmdOrCtrl+Shift+Space");

    expect(shortcutFromKeyboardEvent({
      key: "k",
      code: "KeyK",
      metaKey: true,
      altKey: true,
    })).toBe("CmdOrCtrl+Alt+K");
  });

  it("allows intentional bare push-to-talk keys but ignores normal typing keys", () => {
    expect(shortcutFromKeyboardEvent({ key: " ", code: "Space" })).toBe("Space");
    expect(shortcutFromKeyboardEvent({ key: "F8", code: "F8" })).toBe("F8");
    expect(shortcutFromKeyboardEvent({ key: "a", code: "KeyA" })).toBeUndefined();
    expect(shortcutFromKeyboardEvent({ key: "Shift", code: "ShiftLeft", shiftKey: true })).toBeUndefined();
  });

  it("matches CmdOrCtrl against either platform modifier", () => {
    expect(sttShortcutMatchesEvent("CmdOrCtrl+Shift+Space", {
      key: " ",
      code: "Space",
      metaKey: true,
      shiftKey: true,
    })).toBe(true);
    expect(sttShortcutMatchesEvent("CmdOrCtrl+Shift+Space", {
      key: " ",
      code: "Space",
      ctrlKey: true,
      shiftKey: true,
    })).toBe(true);
    expect(sttShortcutMatchesEvent("CmdOrCtrl+Shift+Space", {
      key: " ",
      code: "Space",
      ctrlKey: true,
    })).toBe(false);
  });

  it("detects release of any held shortcut member", () => {
    expect(sttShortcutReleaseMatchesEvent("CmdOrCtrl+Shift+Space", { key: " ", code: "Space" })).toBe(true);
    expect(sttShortcutReleaseMatchesEvent("CmdOrCtrl+Shift+Space", { key: "Shift", code: "ShiftLeft" })).toBe(true);
    expect(sttShortcutReleaseMatchesEvent("CmdOrCtrl+Shift+Space", { key: "Meta", code: "MetaLeft" })).toBe(true);
    expect(sttShortcutReleaseMatchesEvent("CmdOrCtrl+Shift+Space", { key: "Alt", code: "AltLeft" })).toBe(false);
  });

  it("formats persisted shortcuts for Settings and composer hints", () => {
    expect(sttShortcutLabel("CmdOrCtrl+Shift+Space")).toBe("Cmd/Ctrl + Shift + Space");
    expect(sttShortcutLabel("Space")).toBe("Space");
    expect(sttShortcutLabel(undefined)).toBe("Not set");
  });

  it("suppresses bare STT shortcuts in editable targets while allowing modified shortcuts", () => {
    withElementStub(() => {
      expect(shouldSuppressSttShortcutEventTarget({} as EventTarget, "Space")).toBe(false);
      expect(shouldSuppressSttShortcutEventTarget(
        elementWithClosest("input, textarea, select, [contenteditable], [role='textbox']"),
        "Space",
      )).toBe(true);
      expect(shouldSuppressSttShortcutEventTarget(
        elementWithClosest("input, textarea, select, [contenteditable], [role='textbox']"),
        "CmdOrCtrl+Space",
      )).toBe(false);
    });
  });

  it("always lets explicit STT shortcut capture targets handle the shortcut", () => {
    withElementStub(() => {
      expect(shouldSuppressSttShortcutEventTarget(
        elementWithClosest("[data-stt-shortcut-capture='true']"),
        "CmdOrCtrl+Space",
      )).toBe(true);
    });
  });
});

function withElementStub(run: () => void): void {
  const previous = Object.getOwnPropertyDescriptor(globalThis, "Element");
  Object.defineProperty(globalThis, "Element", {
    configurable: true,
    value: TestElement,
  });
  try {
    run();
  } finally {
    if (previous) {
      Object.defineProperty(globalThis, "Element", previous);
    } else {
      delete (globalThis as { Element?: unknown }).Element;
    }
  }
}

function elementWithClosest(selector: string): EventTarget {
  return new TestElement(selector) as unknown as EventTarget;
}

class TestElement {
  constructor(private readonly closestSelector: string) {}

  closest(selector: string): TestElement | null {
    return selector === this.closestSelector ? this : null;
  }
}
