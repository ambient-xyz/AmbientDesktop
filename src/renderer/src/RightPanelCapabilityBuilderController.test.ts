import { describe, expect, it } from "vitest";

import {
  capabilityBuilderDraftWithPatch,
  capabilityBuilderLauncherCanSubmit,
} from "./RightPanelCapabilityBuilderController";
import { defaultCapabilityBuilderLauncherDraft } from "./pluginUiModel";

describe("RightPanelCapabilityBuilderController", () => {
  it("patches launcher drafts without changing unspecified fields", () => {
    const current = {
      ...defaultCapabilityBuilderLauncherDraft(),
      goal: "Build a docs plugin",
      provider: "filesystem",
    };

    expect(capabilityBuilderDraftWithPatch(current, { outputArtifact: "report.md" })).toEqual({
      ...current,
      outputArtifact: "report.md",
    });
    expect(current.outputArtifact).toBe("");
  });

  it("only allows submit when there is a goal and the app is not running", () => {
    const draft = { ...defaultCapabilityBuilderLauncherDraft(), goal: "  Create a browser helper  " };
    expect(capabilityBuilderLauncherCanSubmit(draft, false)).toBe(true);
    expect(capabilityBuilderLauncherCanSubmit(draft, true)).toBe(false);
    expect(capabilityBuilderLauncherCanSubmit({ ...draft, goal: "   " }, false)).toBe(false);
  });
});
