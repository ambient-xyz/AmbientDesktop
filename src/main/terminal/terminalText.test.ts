import { describe, expect, it } from "vitest";
import { TerminalTextBuffer, normalizeTerminalData, stripAnsi } from "./terminalText";

describe("stripAnsi", () => {
  it("removes common SGR sequences", () => {
    expect(stripAnsi("\u001b[31mred\u001b[0m")).toBe("red");
  });

  it("removes terminal title escape sequences", () => {
    expect(stripAnsi("\u001b]0;title\u0007prompt")).toBe("prompt");
  });
});

describe("normalizeTerminalData", () => {
  it("normalizes CRLF while treating bare carriage returns as line rewrites", () => {
    expect(normalizeTerminalData("a\r\nb\rc")).toBe("a\nc");
  });
});

describe("TerminalTextBuffer", () => {
  it("rewrites the current prompt line across chunks", () => {
    const buffer = new TerminalTextBuffer();
    buffer.write("% ");
    buffer.write("\rtravis@host workspace % cd ~/ComfyUI\r\n");
    expect(buffer.text()).toBe("travis@host workspace % cd ~/ComfyUI\n");
  });
});
