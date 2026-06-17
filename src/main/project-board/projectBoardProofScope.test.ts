import { describe, expect, it } from "vitest";
import {
  projectBoardProofOwnershipForCard,
  projectBoardProofScopePromptRules,
  projectBoardProofScopeWarningRecords,
  projectBoardProofScopeWarnings,
} from "./projectBoardProofScope";

describe("project board proof scope", () => {
  it("warns when pure input-adapter cards inherit browser screenshot proof", () => {
    const card = {
      sourceId: "synthesis:input-adapter",
      title: "Build InputAdapter for keyboard-to-intent mapping",
      description: "Translate keyboard events into thrust and dodge intents for the game loop.",
      phase: "Foundation",
      labels: ["input-adapter", "controls"],
      acceptanceCriteria: ["Keyboard events produce stable intent objects."],
      testPlan: {
        unit: ["Test keydown/keyup mapping into thrust intent."],
        integration: ["Verify the game loop can consume intent objects."],
        visual: ["Holding thrust key in browser causes ship to accelerate visually."],
        manual: [],
      },
    };

    expect(projectBoardProofOwnershipForCard(card)).toBe("pure_module");
    expect(projectBoardProofScopeWarnings(card)).toEqual([
      expect.stringContaining("looks like a pure/module-boundary card"),
    ]);
    expect(projectBoardProofScopeWarningRecords([card], "2026-05-10T00:00:00.000Z")[0]).toMatchObject({
      type: "warning",
      code: "proof_scope_mismatch",
      metadata: {
        cardId: "synthesis:input-adapter",
        proofOwnership: "pure_module",
        visualProofItems: ["Holding thrust key in browser causes ship to accelerate visually."],
      },
    });
  });

  it("keeps visual proof on cards that own visible canvas behavior", () => {
    const card = {
      sourceId: "synthesis:pixijs-game-shell",
      title: "Create the PixiJS game shell",
      description: "Set up the PixiJS renderer, render loop, and a nonblank starfield scene.",
      phase: "Foundation",
      labels: ["pixijs", "canvas", "foundation"],
      acceptanceCriteria: ["Canvas renders a visible starfield."],
      testPlan: {
        unit: [],
        integration: ["Run the app."],
        visual: ["Capture a screenshot proving the canvas is nonblank."],
        manual: [],
      },
    };

    expect(projectBoardProofOwnershipForCard(card)).toBe("visible_surface");
    expect(projectBoardProofScopeWarnings(card)).toEqual([]);
  });

  it("documents proof ownership rules for Pi prompts", () => {
    expect(projectBoardProofScopePromptRules().join("\n")).toMatch(/Pure module cards/i);
    expect(projectBoardProofScopePromptRules().join("\n")).toMatch(/downstream renderer\/gameplay\/HUD\/proof card/i);
  });
});
