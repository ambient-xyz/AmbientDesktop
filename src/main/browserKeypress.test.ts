import { describe, expect, it } from "vitest";
import { normalizeBrowserKeypressInput } from "./browserService";

describe("browser keypress normalization", () => {
  it("normalizes game-style special keys", () => {
    const input = normalizeBrowserKeypressInput({
      keys: [
        { key: "Space", durationMs: 120 },
        { code: "ArrowUp" },
        { key: "a" },
      ],
    });

    expect(input.focus).toBe("page");
    expect(input.keys.map((key) => ({ key: key.key, code: key.code, text: key.text, durationMs: key.durationMs }))).toEqual([
      { key: " ", code: "Space", text: " ", durationMs: 120 },
      { key: "ArrowUp", code: "ArrowUp", text: undefined, durationMs: 80 },
      { key: "a", code: "KeyA", text: "a", durationMs: 80 },
    ]);
    expect(input.keys[0].windowsVirtualKeyCode).toBe(32);
    expect(input.keys[2].electronKeyCode).toBe("A");
  });

  it("rejects empty key sequences", () => {
    expect(() => normalizeBrowserKeypressInput({ keys: [] })).toThrow("requires at least one key");
  });
});
