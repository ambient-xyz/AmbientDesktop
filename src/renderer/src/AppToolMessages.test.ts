import { describe, expect, it } from "vitest";

import { editTextCountLabel, fileBaseName, isBrowserToolName } from "./AppToolMessages";

describe("tool message helpers", () => {
  it("recognizes browser tool names with the existing prefix rule", () => {
    expect(isBrowserToolName("browser_open")).toBe(true);
    expect(isBrowserToolName("Browser_Click")).toBe(true);
    expect(isBrowserToolName("workspace_read")).toBe(false);
  });

  it("formats artifact base names from file paths", () => {
    expect(fileBaseName("/tmp/report.html")).toBe("report.html");
    expect(fileBaseName("C:\\\\Users\\\\Ambient\\\\image.png")).toBe("image.png");
    expect(fileBaseName("artifact")).toBe("artifact");
  });

  it("keeps edit count labels stable for truncated previews", () => {
    expect(editTextCountLabel(1200, 300, true)).toBe("1,200 chars total · 300 preview");
    expect(editTextCountLabel(42, 42, false)).toBe("42 chars");
    expect(editTextCountLabel(undefined, 42, true)).toBeUndefined();
  });
});
