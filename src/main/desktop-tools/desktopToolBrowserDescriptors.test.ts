import { describe, expect, it } from "vitest";

import { browserToolDescriptor, browserToolDescriptors } from "./desktopToolRegistry";
import { browserToolDescriptors as focusedBrowserToolDescriptors } from "./desktopToolBrowserDescriptors";

describe("desktopToolBrowserDescriptors", () => {
  it("keeps the public registry browser descriptor export wired to the focused module", () => {
    expect(browserToolDescriptors).toBe(focusedBrowserToolDescriptors);
    expect(browserToolDescriptor("browser_local_preview")).toBe(
      focusedBrowserToolDescriptors.find((tool) => tool.name === "browser_local_preview"),
    );
  });
});
