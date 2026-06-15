import { describe, expect, it } from "vitest";

import { ambientMiniLogoUrl } from "./AppBranding";

describe("App branding assets", () => {
  it("points the Ambient mini logo at the existing SVG asset", () => {
    expect(ambientMiniLogoUrl).toContain("ambient-mini.svg");
  });
});
