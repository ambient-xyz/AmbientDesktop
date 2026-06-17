import { describe, expect, it } from "vitest";
import { resolveAgentHarnessVariant } from "./agentHarnessVariant";

describe("agent harness variants", () => {
  it("defaults to baseline behavior", () => {
    expect(resolveAgentHarnessVariant({})).toMatchObject({
      id: "baseline",
      enabled: false,
    });
  });

  it("resolves script bootstrap aliases", () => {
    expect(resolveAgentHarnessVariant({ AMBIENT_HARNESS_VARIANT: "scripts" })).toMatchObject({
      id: "bootstrap-scripts",
      enabled: true,
      bootstrap: expect.objectContaining({
        includeGitSummary: true,
        includePackageScripts: true,
        includeToolClasses: false,
      }),
    });
  });

  it("falls back to baseline for unknown variants", () => {
    const variant = resolveAgentHarnessVariant({ AMBIENT_HARNESS_VARIANT: "something-new" });

    expect(variant).toMatchObject({
      id: "baseline",
      requestedId: "something-new",
      enabled: false,
    });
    expect(variant.warning).toContain("something-new");
  });
});
