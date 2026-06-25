import { describe, expect, it } from "vitest";

import {
  searchPreferenceToolDescriptor,
  searchPreferenceToolDescriptors,
  webResearchToolDescriptor,
  webResearchToolDescriptors,
} from "./desktopToolRegistry";
import {
  searchPreferenceToolDescriptors as focusedSearchPreferenceToolDescriptors,
  webResearchToolDescriptors as focusedWebResearchToolDescriptors,
} from "./desktopToolWebResearchDescriptors";

describe("desktopToolWebResearchDescriptors", () => {
  it("keeps the public registry web research descriptor exports wired to the focused module", () => {
    expect(webResearchToolDescriptors).toBe(focusedWebResearchToolDescriptors);
    expect(searchPreferenceToolDescriptors).toBe(focusedSearchPreferenceToolDescriptors);
    expect(webResearchToolDescriptor("web_research_search")).toBe(
      focusedWebResearchToolDescriptors.find((tool) => tool.name === "web_research_search"),
    );
    expect(searchPreferenceToolDescriptor("ambient_search_preference_update")).toBe(
      focusedSearchPreferenceToolDescriptors.find((tool) => tool.name === "ambient_search_preference_update"),
    );
  });
});
