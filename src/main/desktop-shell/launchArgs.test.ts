import { describe, expect, it } from "vitest";
import { AMBIENT_SUBAGENTS_FEATURE_FLAG } from "../../shared/featureFlags";
import { parseAmbientLaunchArgs } from "./launchArgs";

describe("launch args", () => {
  it("parses launch args into a boot feature-flag snapshot input", () => {
    expect(parseAmbientLaunchArgs(["--enable-feature=ambient.subagents"]).featureFlags.enabled).toEqual([AMBIENT_SUBAGENTS_FEATURE_FLAG]);
  });
});
