import { describe, expect, it } from "vitest";

import type { AmbientPluginRegistry } from "../../shared/types";
import { welcomePluginSetupStats } from "./AppWelcomeSetup";

describe("welcome setup helpers", () => {
  it("summarizes plugin setup registry counts from the displayed capability slice", () => {
    const registry = {
      plugins: [
        { installState: "installed" },
        { installState: "importable" },
        { installState: "generated" },
      ],
      capabilities: Array.from({ length: 13 }, (_, index) => ({
        id: `capability-${index}`,
        generated: index < 3,
      })),
      sources: [],
      errors: [],
      sourceNotes: [],
    } as unknown as AmbientPluginRegistry;

    expect(welcomePluginSetupStats()).toEqual({
      capabilities: [],
      installedPluginCount: 0,
      generatedCapabilityCount: 0,
    });

    const stats = welcomePluginSetupStats(registry);
    expect(stats.capabilities).toHaveLength(12);
    expect(stats.capabilities.at(-1)?.id).toBe("capability-11");
    expect(stats.installedPluginCount).toBe(2);
    expect(stats.generatedCapabilityCount).toBe(3);
  });
});
